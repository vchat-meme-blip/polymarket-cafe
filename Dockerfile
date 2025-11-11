# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache make

# Copy package files and install all dependencies
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies and development tools
RUN npm install -g typescript@5.3.3 && \
    npm install --save-dev @types/node@22.14.0 && \
    npm ci --legacy-peer-deps --no-optional
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
RUN apk add --no-cache curl

WORKDIR /app

# Set production environment
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}
ENV DOCKER_ENV=true
ENV NODE_ENV=production

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps --no-optional

# Create necessary directories
RUN mkdir -p /app/dist/workers /app/dist/server/workers /app/logs /app/dist/client

# Copy built files from builder
COPY --from=builder /app/dist/server/ /app/dist/server/

# Copy and rename worker files from .js to .mjs
RUN echo "Copying and renaming worker files..." && \
    mkdir -p /app/dist/server/server/workers && \
    # First, copy all worker files to the target directory with .mjs extension
    find /app/dist -name "*.worker.js" | while read file; do \
        if [ -f "$file" ]; then \
            cp "$file" "/app/dist/server/server/workers/$(basename "$file" .js).mjs"; \
            echo "Copied $file to /app/dist/server/server/workers/$(basename "$file" .js).mjs"; \
        fi; \
    done && \
    # Verify the files were copied with .mjs extension
    echo "Worker files in /app/dist/server/server/workers/:" && \
    ls -la /app/dist/server/server/workers/ 2>/dev/null || echo "No worker files found"

# Copy client files
COPY --from=builder /app/dist/client/ /app/dist/client/

# Handle public directory
RUN if [ -d "/app/public" ]; then \
      echo "Copying public directory" && \
      mkdir -p /app/dist/client && \
      cp -r /app/public/* /app/dist/client/ 2>/dev/null || true; \
    else \
      echo "No public directory found, creating an empty one" && \
      mkdir -p /app/dist/client; \
    fi
COPY --from=builder /app/ecosystem.config.* ./
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.env* ./

# Create symlinks for backward compatibility (using .mjs extension)
RUN if [ -d "/app/dist/server/server/workers" ]; then \
        # Create .js symlinks for all .mjs worker files
        for file in /app/dist/server/server/workers/*.mjs; do \
            if [ -f "$file" ]; then \
                ln -sf "$file" "/app/dist/server/workers/$(basename "$file" .mjs).js" 2>/dev/null || true; \
                # Also create a .mjs symlink in the same directory for consistency
                ln -sf "$file" "/app/dist/server/workers/$(basename "$file")" 2>/dev/null || true; \
            fi; \
        done; \
        # Also ensure the workers directory is accessible from the root
        mkdir -p /app/dist/workers && \
        for file in /app/dist/server/server/workers/*.mjs; do \
            if [ -f "$file" ]; then \
                ln -sf "$file" "/app/dist/workers/$(basename "$file" .mjs).js" 2>/dev/null || true; \
                ln -sf "$file" "/app/dist/workers/$(basename "$file")" 2>/dev/null || true; \
            fi; \
        done; \
    fi

# Verify the build output
RUN echo "Build output verification:" && \
    echo "\nServer files:" && ls -la /app/dist/server/ && \
    echo "\nWorkers in /app/dist/workers/:" && ls -la /app/dist/workers/ 2>/dev/null || echo "No workers in /app/dist/workers/" && \
    echo "\nWorkers in /app/dist/server/workers/:" && ls -la /app/dist/server/workers/ 2>/dev/null || echo "No workers in /app/dist/server/workers/" && \
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

# Health check on port 3002
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3002/api/health || exit 1

# Expose both application and health check ports
EXPOSE ${PORT} 3002

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
CMD ["/bin/sh", "-c", "trap 'pkill -f node || true; exit 0' INT TERM; /app/startup.sh"]