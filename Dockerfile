# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and install all dependencies
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies and development tools
RUN npm install -g typescript@5.3.3 && \
    npm install --save-dev @types/node@22.14.0 && \
    npm ci --legacy-peer-deps
# Copy the rest of the application
COPY . .

# Build the application
RUN echo "Building client..." && \
    npm run build:client

# Build server separately to handle any specific requirements
RUN echo "Building server..." && \
    npm run build:server && \
    npm run postbuild:server

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

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Create necessary directories
RUN mkdir -p /app/dist/server/workers /app/logs /app/dist/client

# Copy built files from builder
COPY --from=builder /app/dist/server/ /app/dist/server/
COPY --from=builder /app/dist/client/ /app/dist/client/
COPY --from=builder /app/public/ /app/public/
COPY --from=builder /app/ecosystem.config.* ./
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.env* ./

# Verify the build output
RUN echo "Build output verification:" && \
    echo "Server files:" && ls -la /app/dist/server/ && \
    echo "\nWorkers directory:" && ls -la /app/dist/server/workers/ 2>/dev/null || echo "No workers found" && \
    echo "\nClient files:" && ls -la /app/dist/client/ 2>/dev/null || echo "No client files found"

COPY --from=builder /app/server/env.ts ./dist/server/

# Verify the build output, surface entry point, and persist it for runtime
RUN set -e; \
    echo "Verifying build..."; \
    if [ -f "/app/dist/server/server/index.mjs" ]; then \
        ENTRYPOINT="/app/dist/server/server/index.mjs"; \
    elif [ -f "/app/dist/server/server/index.js" ]; then \
        ENTRYPOINT="/app/dist/server/server/index.js"; \
    elif [ -f "/app/dist/server/index.mjs" ]; then \
        ENTRYPOINT="/app/dist/server/index.mjs"; \
    elif [ -f "/app/dist/server/index.js" ]; then \
        ENTRYPOINT="/app/dist/server/index.js"; \
    else \
        echo "Error: No entry point found in /app/dist/server"; \
        echo "Build output in /app/dist:"; \
        find /app/dist -type f; \
        exit 1; \
    fi; \
    echo "Found entry point at $ENTRYPOINT"; \
    echo "First 10 lines of entry point:"; \
    head -n 10 "$ENTRYPOINT" || true; \
    echo "..."; \
    echo "$ENTRYPOINT" > /app/.entrypoint-path; \
    echo "Will use entry point: $(cat /app/.entrypoint-path)"

# Set working directory to the app root
WORKDIR /app

# Health check
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
    /app/dist/server/server/index.mjs \
    /app/dist/server/server/index.js \
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
ENTRYPOINT_PATH=$(resolve_entrypoint) || {
  log "  - Entry point: (not found)"
  log "❌ Could not determine entry point. Listing /app/dist/server:";
  find /app/dist/server -maxdepth 2 -type f 2>/dev/null || true
  exit 1
}

log "  - Entry point: $ENTRYPOINT_PATH"
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
log "🚀 Starting application..."
exec node --no-warnings "$ENTRYPOINT_PATH"
EOF

# Start the application
CMD ["/app/startup.sh"]