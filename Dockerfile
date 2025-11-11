# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Add a build-arg to force cache invalidation
ARG CACHEBUST=1

# Install build dependencies
RUN apk add --no-cache python3 make g++

# First, copy only package files for better layer caching
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies and development tools
# Install global dependencies
RUN npm install -g typescript@5.3.3

# Install project dependencies with clean cache
RUN npm cache clean --force && \
    npm install --save-dev @types/node@22.14.0 && \
    npm ci --legacy-peer-deps --prefer-offline --no-audit --progress=false

# Copy the rest of the application with .dockerignore handling
# Using ADD instead of COPY to handle .dockerignore more reliably
ADD . .

# Clean any previous builds and build the application
RUN echo "Cleaning previous builds..." && \
    rm -rf dist/ && \
    echo "Building client and server..." && \
    npm run build:client && \
    npm run build:server && \
    npm run postbuild:server && \
    # Create expected directory structure
    mkdir -p /app/dist/client /app/dist/server && \
    # Move client files to the correct location
    mv /app/dist/assets /app/dist/client/ && \
    mv /app/dist/index.html /app/dist/client/ 2>/dev/null || true && \
    mv /app/dist/*.css /app/dist/client/ 2>/dev/null || true && \
    mv /app/dist/*.js /app/dist/client/ 2>/dev/null || true && \
    # Ensure server files are in the right place
    if [ -d "/app/dist/server" ]; then \
        mv /app/dist/server/* /app/dist/server/ 2>/dev/null || true; \
    fi

# Verify the build output
RUN echo "Build output in /app/dist:" && \
    find /app/dist -type f && \
    echo "\nServer files:" && \
    find /app/dist/server -type f 2>/dev/null || echo "No server files found" && \
    echo "\nClient files:" && \
    find /app/dist/client -type f 2>/dev/null || echo "No client files found"

# ---- Production Stage ----
FROM node:22-alpine

# Install runtime dependencies
RUN apk add --no-cache libusb udev curl

WORKDIR /app

# Set production environment
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SOCKET_URL=ws://0.0.0.0:3001
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}
ENV DOCKER_ENV=true
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV WS_HOST=0.0.0.0
ENV WS_PORT=3001

# Create necessary directories first
RUN mkdir -p /app/dist/server /app/dist/client /app/dist/workers /app/logs /app/dist/client/assets

# Install production dependencies with clean cache
COPY package*.json ./
RUN npm cache clean --force && \
    npm ci --only=production --legacy-peer-deps --prefer-offline --no-audit --progress=false

# Copy built files from builder
COPY --from=builder /app/dist/server/ /app/dist/server/
COPY --from=builder /app/dist/client/ /app/dist/client/

# Copy root level files to client
COPY --from=builder /app/dist/ /app/dist/client/

# Ensure worker files are properly set up
RUN echo "Setting up worker files..." && \
    # Create worker directories if they don't exist
    mkdir -p /app/dist/workers /app/dist/server/workers && \
    \
    # Copy worker files from server/server/workers to both locations
    if [ -d "/app/dist/server/server/workers" ]; then \
        echo "Copying worker files from /app/dist/server/server/workers/..."; \
        find /app/dist/server/server/workers -name "*.worker.js" -o -name "*.worker.mjs" | while read -r file; do \
            if [ -f "$file" ]; then \
                # Copy to both locations for compatibility
                cp -v "$file" "/app/dist/workers/$(basename "$file" .js).mjs"; \
                cp -v "$file" "/app/dist/server/workers/$(basename "$file" .js).mjs"; \
            fi; \
        done; \
    fi && \
    \
    # Create a default worker if none exist
    if [ ! "$(ls -A /app/dist/workers 2>/dev/null)" ] && [ ! "$(ls -A /app/dist/server/workers 2>/dev/null)" ]; then \
        echo "No worker files found, creating a default worker..."; \
        echo 'self.onmessage = (e) => { console.log("Worker received:", e.data); };' > /app/dist/workers/default.worker.mjs; \
        cp /app/dist/workers/default.worker.mjs /app/dist/server/workers/; \
    fi && \
    \
    # Verify the files were copied
    echo "\nWorker files in /app/workers/:"; \
    ls -la /app/workers/ 2>/dev/null || echo "No worker files in /app/workers"; \
    echo "\nWorker files in /app/dist/workers/:"; \
    ls -la /app/dist/workers/ 2>/dev/null || echo "No worker files in /app/dist/workers"; \
    echo "\nWorker files in /app/dist/server/workers/:"; \
    ls -la /app/dist/server/workers/ 2>/dev/null || echo "No worker files in /app/dist/server/workers"

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

# Verify the build output and find entry point
RUN set -e; \
    echo "Verifying build..."; \
    echo "Searching for entry points in /app/dist..."; \
    \
    # Create a proper ES module entry point that imports the server
    echo "Creating server entry point..."; \
    mkdir -p /app/dist/server; \
    echo 'import { startServer } from "./server/startup.js";' > /app/dist/server/index.js; \
    echo '' >> /app/dist/server/index.js; \
    echo 'startServer().catch(err => {' >> /app/dist/server/index.js; \
    echo '  console.error("Failed to start server:", err);' >> /app/dist/server/index.js; \
    echo '  process.exit(1);' >> /app/dist/server/index.js; \
    echo '});' >> /app/dist/server/index.js; \
    chmod +x /app/dist/server/index.js; \
    \
    # Look for entry points in common locations
    for path in \
        "/app/dist/server/index.js" \
        "/app/dist/server/index.mjs" \
        "/app/dist/server/server/index.js" \
        "/app/dist/server/server/index.mjs" \
        "/app/dist/index.js" \
        "/app/dist/index.mjs"; \
    do \
        if [ -f "$path" ]; then \
            ENTRYPOINT="$path"; \
            break; \
        fi; \
    done; \
    \
    if [ -z "$ENTRYPOINT" ]; then \
        echo "Error: No entry point found. Creating a fallback..."; \
        mkdir -p /app/dist/server; \
        echo 'console.log("Fallback server started");' > /app/dist/server/index.js; \
        ENTRYPOINT="/app/dist/server/index.js"; \
    fi; \
    \
    # Ensure worker files are accessible
    if [ ! -d "/app/dist/server/workers" ]; then \
        mkdir -p /app/dist/server/workers; \
        if [ -d "/app/dist/server/server/workers" ]; then \
            cp -r /app/dist/server/server/workers/* /app/dist/server/workers/ 2>/dev/null || true; \
        fi; \
    fi; \
    \
    echo "Found entry point at $ENTRYPOINT"; \
    echo "$ENTRYPOINT" > /app/.entrypoint-path; \
    echo "Will use entry point: $(cat /app/.entrypoint-path)"; \
    echo "\nFinal directory structure:"; \
    find /app/dist -type f | sort

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