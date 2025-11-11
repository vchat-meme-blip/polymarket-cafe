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
    # Build server with the updated TypeScript config
    echo "Building server with TypeScript..." && \
    npx tsc -p tsconfig.server.json && \
    npx tsc-alias -p tsconfig.server.json && \
    # Run postbuild steps
    npm run postbuild:server && \
    # Create expected directory structure
    mkdir -p /app/dist/client /app/dist/server/server && \
    # Move client files to the correct location
    mv /app/dist/assets /app/dist/client/ 2>/dev/null || true && \
    mv /app/dist/index.html /app/dist/client/ 2>/dev/null || true && \
    mv /app/dist/*.css /app/dist/client/ 2>/dev/null || true && \
    mv /app/dist/*.js /app/dist/client/ 2>/dev/null || true && \
    # Verify the build output
    echo "Build output structure:" && \
    find /app/dist -type f | sort && \
    echo "\nServer files:" && \
    find /app/dist/server -type f 2>/dev/null || echo "No server files found" && \
    echo "\nLib files:" && \
    find /app/dist/server/lib -type f 2>/dev/null || echo "No lib files found"

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
    if [ -d "/app/dist/server/server/workers" ]; then \
        echo "Copying worker files from /app/dist/server/server/workers/..."; \
        find /app/dist/server/server/workers -name "*.worker.js" -o -name "*.worker.mjs" | while read -r file; do \
            if [ -f "$file" ]; then \
                cp -v "$file" "/app/dist/workers/$(basename "$file" .js).mjs"; \
                cp -v "$file" "/app/dist/server/workers/$(basename "$file" .js).mjs"; \
            fi; \
        done; \
    fi && \
    echo "Worker files in /app/dist/workers/:" && \
    ls -la /app/dist/workers/ 2>/dev/null || echo "No worker files in /app/dist/workers" && \
    echo "Worker files in /app/dist/server/workers/:" && \
    ls -la /app/dist/server/workers/ 2>/dev/null || echo "No worker files in /app/dist/server/workers"

# Ensure the server directory structure is correct
RUN mkdir -p /app/dist/server && \
    # Create a symlink to the server files for backward compatibility
    if [ -d "/app/dist/server/server" ]; then \
        echo "Creating symlinks for server files..."; \
        # Create a symlink for startup.js in the root server directory
        if [ -f "/app/dist/server/server/startup.js" ]; then \
            ln -sf /app/dist/server/server/startup.js /app/dist/server/startup.js 2>/dev/null || true; \
        fi; \
        # List all files for debugging
        echo "Contents of /app/dist/server:"; \
        ls -la /app/dist/server/; \
        echo "Contents of /app/dist/server/server:"; \
        ls -la /app/dist/server/server/; \
    else \
        echo "ERROR: Server files not found in /app/dist/server/server"; \
        echo "Current directory structure:"; \
        find /app/dist -type d | sort; \
        exit 1; \
    fi

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

# Copy built files with correct structure
RUN echo "Copying built files..." && \
    # Create necessary directories
    mkdir -p /app/dist/server /app/dist/client /app/dist/workers && \
    # Copy server files
    if [ -d "/app/dist/server/server" ]; then \
        echo "Server files already in correct location"; \
    else \
        echo "Moving server files to correct location"; \
        mv /app/dist/server/* /app/dist/ 2>/dev/null || true; \
    fi && \
    # Ensure lib directory exists and copy it
    echo "Copying lib directory..." && \
    mkdir -p /app/dist/server/lib && \
    if [ -d "/app/dist/lib" ]; then \
        cp -r /app/dist/lib/* /app/dist/server/lib/; \
    elif [ -d "/app/lib" ]; then \
        cp -r /app/lib/* /app/dist/server/lib/; \
    fi && \
    # Copy package files and node_modules
    cp /app/package*.json ./ && \
    cp -r /app/node_modules/ ./node_modules/ && \
    # Verify the lib directory was copied
    echo "Lib directory contents:" && \
    find /app/dist/server/lib -type f 2>/dev/null || echo "No lib files found"

# Verify build output structure
RUN echo "Build output structure:" && \
    echo "Contents of /app/dist:" && ls -la /app/dist/ && \
    echo "\nContents of /app/dist/server:" && ls -la /app/dist/server/ 2>/dev/null || echo "No server directory found" && \
    echo "\nContents of /app/dist/server/lib:" && ls -la /app/dist/server/lib/ 2>/dev/null || echo "No lib directory found" && \
    echo "\nContents of /app/dist/server/server:" && ls -la /app/dist/server/server/ 2>/dev/null || echo "No server/server directory found" && \
    # Ensure required files exist
    if [ ! -f "/app/dist/server/lib/presets/agents.js" ]; then \
        echo "ERROR: Missing required file: /app/dist/server/lib/presets/agents.js"; \
        echo "Searching for agents.js in build output..."; \
        find /app/dist -name "agents.js" || echo "agents.js not found"; \
        exit 1; \
    fi

# Set up worker files
RUN echo "Setting up worker files..." && \
    mkdir -p /app/dist/workers /app/dist/server/workers && \
    # First check the new location
    if [ -d "/app/dist/server/server/workers" ]; then \
        echo "Copying worker files from /app/dist/server/server/workers/..."; \
        find /app/dist/server/server/workers -name "*.worker.js" -o -name "*.worker.mjs" | while read -r file; do \
            if [ -f "$file" ]; then \
                cp -v "$file" "/app/dist/workers/$(basename "$file" .js).mjs"; \
                cp -v "$file" "/app/dist/server/workers/$(basename "$file" .js).mjs"; \
            fi; \
        done; \
    # Fallback to checking the client directory
    elif [ -d "/app/dist/client/server/workers" ]; then \
        echo "Copying worker files from /app/dist/client/server/workers/..."; \
        find /app/dist/client/server/workers -name "*.worker.js" -o -name "*.worker.mjs" | while read -r file; do \
            if [ -f "$file" ]; then \
                cp -v "$file" "/app/dist/workers/$(basename "$file" .js).mjs"; \
                cp -v "$file" "/app/dist/server/workers/$(basename "$file" .js).mjs"; \
            fi; \
        done; \
    fi && \
    echo "Worker files in /app/dist/workers/:" && \
    ls -la /app/dist/workers/ 2>/dev/null || echo "No worker files in /app/dist/workers" && \
    echo "Worker files in /app/dist/server/workers/:" && \
    ls -la /app/dist/server/workers/ 2>/dev/null || echo "No worker files in /app/dist/server/workers"

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
    # Create the entry point with the correct path to startup.js
    echo 'import { startServer } from "./server/startup.js";' > /app/dist/server/index.js; \
    echo 'console.log("Starting server from", __filename);' >> /app/dist/server/index.js; \
    echo 'startServer().catch(err => {' >> /app/dist/server/index.js; \
    echo '  console.error("Failed to start server:", err);' >> /app/dist/server/index.js; \
    echo '  process.exit(1);' >> /app/dist/server/index.js; \
    echo '});' >> /app/dist/server/index.js; \
    chmod +x /app/dist/server/index.js; \
    echo "Entry point created at /app/dist/server/index.js"; \
    echo "Contents of /app/dist/server:"; \
    ls -la /app/dist/server/; \
    if [ -d "/app/dist/server/server" ]; then \
        echo "Contents of /app/dist/server/server:"; \
        ls -la /app/dist/server/server/; \
    fi; \
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

# Set working directory to /app for consistent paths
WORKDIR /app

# Start the application with node flags for better error handling
CMD ["node", "--trace-warnings", "--unhandled-rejections=strict", "dist/server/index.js"]