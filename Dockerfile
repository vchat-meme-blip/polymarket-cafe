# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and install all dependencies
COPY package*.json ./
COPY tsconfig*.json ./
# FIX: Copy jsconfig.json as it might be used by some tools
COPY jsconfig.json ./

# Install dependencies and development tools
RUN npm install -g typescript@5.3.3 && \
    npm install --save-dev @types/node@22.14.0 && \
    npm ci --legacy-peer-deps
# Copy the rest of the application
COPY . .

# Build the application
RUN echo "Building client..." && \
    npm run build:client

# Build server and workers
RUN echo "Building server and workers..." && \
    npm run build:server && \
    npm run build:workers && \
    npm run postbuild:server && \
    npm run postbuild:workers

# ---- Production Stage ----
FROM node:22-alpine

# Install runtime dependencies
RUN apk add --no-cache libusb udev curl

WORKDIR /app

# Set production environment
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}
ENV DOCKER_ENV=true
ENV NODE_ENV=production
# FIX: Set a default PORT for consistency, although docker-compose overrides it
ENV PORT=3001

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Create necessary directories
RUN mkdir -p /app/dist/server/workers /app/dist/client /app/logs

# Ensure all necessary directories exist
RUN mkdir -p /app/dist/client /app/dist/server/workers /public /app/logs

# Copy built files in stages for better layer caching
COPY --from=builder /app/dist/client/ /app/dist/client/
COPY --from=builder /app/dist/server/ /app/dist/server/

# Explicitly copy worker files
COPY --from=builder /app/dist/server/workers/ /app/dist/server/workers/

# Copy package files and configs
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/ecosystem.config.* ./
COPY --from=builder /app/.env* ./

# Copy public assets if they exist
RUN if [ -d "/app/public" ]; then cp -r /app/public/* /public/; fi

# Verify the build output
RUN echo "Build output verification:" && \
    echo "\nServer files in /app/dist/:" && ls -la /app/dist/ && \
    echo "\nServer files in /app/dist/server/:" && ls -la /app/dist/server/ 2>/dev/null || echo "No server files found in /app/dist/server/" && \
    echo "\nWorkers in /app/dist/server/workers/:" && (ls -la /app/dist/server/workers/ 2>/dev/null || echo "No workers in /app/dist/server/workers/") && \
    echo "\nWorker files found:" && (find /app/dist -name "*.worker.*" -o -name "arena.*" -o -name "resolution.*" -o -name "dashboard.*" -o -name "autonomy.*" -o -name "market-watcher.*" | sort) && \
    echo "\nClient files in /app/dist/client/:" && ls -la /app/dist/client/ 2>/dev/null || echo "No client files found" && \
    echo "\nAll files in /app/dist:" && find /app/dist -maxdepth 3 -type f | sort

# Verify the server entry point
RUN set -e; \
    echo "Verifying server entry point..."; \
    echo "Build output in /app/dist:"; \
    find /app/dist -type f | sort; \
    \
    # Check for server entry point in the correct location
    if [ -f "/app/dist/server/server/index.js" ]; then \
        ENTRYPOINT="/app/dist/server/server/index.js"; \
    else \
        echo "Error: Server entry point not found at /app/dist/server/server/index.js"; \
        echo "Build output in /app/dist/server/server:"; \
        ls -la /app/dist/server/server/ 2>/dev/null || echo "No server files found in /app/dist/server/server"; \
        exit 1; \
    fi; \
    \
    echo "✅ Found server entry point at: $ENTRYPOINT"; \
    echo "File size: $(ls -lh "$ENTRYPOINT" | awk '{print $5}')"; \
    echo "First 10 lines of entry point:"; \
    head -n 10 "$ENTRYPOINT" || true; \
    \
    # Write entry point path for later use
    echo "$ENTRYPOINT" > /app/.entrypoint-path; \
    echo "Will use entry point: $(cat /app/.entrypoint-path)"

# Set working directory to the app root
WORKDIR /app

# Health check - Note: PORT environment variable should be used here, matching docker-compose
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Expose the port your application will run on
EXPOSE ${PORT}

# Create a startup script with debug info and dynamic entry point detection
RUN cat <<'EOF' > /app/startup.sh && \
    chmod +x /app/startup.sh
#!/bin/sh
set -e

log() {
  printf "%s\n" "$1"
}

resolve_entrypoint() {
  if [ -n "$APP_ENTRYPOINT" ] && [ -f "$APP_ENTRYPOINT" ]; then
    echo "$APP_ENTRYPOINT"
    return 0
  fi

  if [ -f /app/.entrypoint-path ]; then
    CACHED_PATH=$(cat /app/.entrypoint-path || true)
    if [ -n "$CACHED_PATH" ] && [ -f "$CACHED_PATH" ]; then
      echo "$CACHED_PATH"
      return 0
    fi
  fi

  for candidate in \
    /app/dist/server/index.mjs \
    /app/dist/server/index.js; do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

log "🔍 Debug Info:"
log "  - Current directory: $(pwd)"

# Define possible entry point locations
ENTRY_POINTS=(
  "/app/dist/server/index.js"
  "/app/dist/index.js"
  "/app/dist/server/server/index.js"
  "$(cat /app/.entrypoint-path 2>/dev/null || echo '')"
)

# Find the first valid entry point
ENTRYPOINT_PATH=""
for entry in "${ENTRY_POINTS[@]}"; do
  if [ -n "$entry" ] && [ -f "$entry" ]; then
    ENTRYPOINT_PATH="$entry"
    log "✅ Found entry point at: $ENTRYPOINT_PATH"
    break
  fi
done

# If no entry point found, show error and exit
if [ -z "$ENTRYPOINT_PATH" ]; then
  log "❌ No valid entry point found. Tried:"
  for entry in "${ENTRY_POINTS[@]}"; do
    log "   - $entry"
  done
  log "\nBuild output in /app/dist:"
  find /app/dist -type f 2>/dev/null || true
  exit 1
fi

# Export the entry point for use in the container
log "  - Using entry point: $ENTRYPOINT_PATH"
ENTRY_DIR=$(dirname "$ENTRYPOINT_PATH" 2>/dev/null || true)
if [ -n "$ENTRY_DIR" ] && [ -d "$ENTRY_DIR" ]; then
  log "  - Directory contents:"
  ls -la "$ENTRY_DIR" 2>/dev/null || log "    (directory not accessible)"
else
  log "  - Directory contents: (directory not found)"
fi

log "  - Node version: $(node --version)"
log "  - NPM version: $(npm --version)"
log "  - Environment variables:"
printenv | grep -v "PASSWORD\|SECRET\|TOKEN\|KEY" | sort | sed 's/^/    /'

log "  - First 20 lines of entry point:"
head -n 20 "$ENTRYPOINT_PATH" 2>/dev/null || log "    Could not read entry point file"

log ""
log " Starting application..."
exec node --no-warnings "$ENTRYPOINT_PATH"
EOF

# Start the application using the resolved entry point
CMD ["sh", "-c", "node /app/dist/server/server/index.js"]