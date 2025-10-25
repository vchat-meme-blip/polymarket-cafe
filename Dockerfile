# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and install all dependencies
COPY package*.json ./
COPY tsconfig*.json ./
COPY jsconfig.json ./

# Install dependencies and development tools
# Removed global typescript install, npm ci will handle dev dependencies
RUN npm ci --legacy-peer-deps

# Copy the rest of the application
COPY . .

# Build the application
RUN echo "Building client..." && \
    npm run build:client

# Build server separately
RUN echo "Building server..." && \
    npm run build:server && \
    npm run postbuild:server

# ---- Production Stage ----
FROM node:22-alpine

# Install runtime dependencies
RUN apk add --no-cache libusb udev curl

WORKDIR /app

# Set production environment variables
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}
ENV DOCKER_ENV=true
ENV NODE_ENV=production
ENV PORT=3001
ENV NODE_PATH="/app/node_modules"

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Create necessary directories
RUN mkdir -p /app/logs /app/dist/server/workers /app/dist/client

# Copy built files from builder
# With rootDir=./server, compiled server code is now directly in /app/dist/server
COPY --from=builder /app/dist/server/ /app/dist/server/
# Copy client files
COPY --from=builder /app/dist/client/ /app/dist/client/
# Copy public assets
COPY --from=builder /app/public/ /app/public/
# Copy PM2 config and env files
COPY --from=builder /app/ecosystem.config.* ./
COPY --from=builder /app/.env* ./

# Verify the build output
RUN echo "Build output verification:" && \
    echo "\nServer files in /app/dist/server/:" && ls -la /app/dist/server/ && \
    echo "\nWorkers in /app/dist/server/workers/:" && ls -la /app/dist/server/workers/ 2>/dev/null || echo "No workers in /app/dist/server/workers/" && \
    echo "\nClient files in /app/dist/client/:" && ls -la /app/dist/client/ 2>/dev/null || echo "No client files found"

# Create a startup script with debug info and dynamic entry point detection
# This is now in the CWD of PM2 in ecosystem.config.mjs
RUN cat <<'EOF' > /app/startup.sh && \
    chmod +x /app/startup.sh
#!/bin/sh
set -e

log() {
  printf "%s\n" "$1"
}

resolve_entrypoint() {
  # Look for entry point directly in /app/dist/server
  if [ -f /app/dist/server/index.mjs ]; then
    echo "/app/dist/server/index.mjs"
    return 0
  fi
  if [ -f /app/dist/server/index.js ]; then
    echo "/app/dist/server/index.js"
    return 0
  fi
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

# Set working directory to the app root
WORKDIR /app

# Health check - Note: PORT environment variable should be used here, matching docker-compose
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Expose the port your application will run on
EXPOSE ${PORT}

# Start the application using the startup.sh script
CMD ["/app/startup.sh"]