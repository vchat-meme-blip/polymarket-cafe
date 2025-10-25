# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies and MongoDB tools
RUN apk add --no-cache python3 make g++ \
    # Add MongoDB tools and dependencies
    && apk add --no-cache mongodb-tools \
    # Install MongoDB client libraries and build tools
    && apk add --no-cache --virtual .build-deps \
        build-base \
        python3-dev \
        libffi-dev \
        openssl-dev \
        libc6-compat \
        git

# Copy package files and install all dependencies
COPY package*.json ./
# Copy pnpm-lock.yaml if it exists, otherwise don't fail
COPY pnpm-lock.yaml* ./
COPY tsconfig*.json ./
# FIX: Copy jsconfig.json as it might be used by some tools
COPY jsconfig.json ./

# Install pnpm using npm with --global-style to avoid permission issues
RUN npm install -g pnpm@8.15.4 --global-style --no-fund --no-audit && \
    # Install TypeScript and type definitions locally
    npm install -g typescript@5.3.3 @types/node@20.11.19 --no-fund --no-audit
# Install root dependencies, handle missing lockfile
RUN if [ -f "pnpm-lock.yaml" ]; then \
        pnpm install --frozen-lockfile; \
    else \
        pnpm install; \
    fi

# Copy the rest of the application
COPY . .

# Install server dependencies
RUN echo "Installing server dependencies..." && \
    # Install mongoose and its types at the root level
    pnpm add mongoose@8.2.0 @types/mongoose@5.11.97 && \
    cd server && \
    pnpm install --production=false && \
    cd ..

# Build the application
RUN echo "Building client..." && \
    npm run build:client

# Build server and workers
RUN echo "Building server and workers..." && \
    npm run build:server && \
    npm run build:workers && \
    npm run postbuild:server && \
    npm run postbuild:workers

# Fix worker extensions
RUN node scripts/fix-worker-extensions.js

# ---- Production Stage ----
FROM node:20-alpine

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

# Copy package files and lockfile if it exists
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install pnpm in production stage
RUN npm install -g pnpm@8.15.4 --global-style --no-fund --no-audit

# Install production dependencies using pnpm
RUN pnpm install --prod --no-frozen-lockfile

# Create necessary directories
RUN mkdir -p /app/dist/server/workers /app/dist/client /app/logs

# Copy all built files from builder
COPY --from=builder /app/dist/ /app/dist/

# Ensure all necessary directories exist
RUN mkdir -p /app/dist/client /public /app/logs

# Copy package files and configs
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./
COPY --from=builder /app/scripts ./
COPY --from=builder /app/ecosystem.config.* ./
COPY --from=builder /app/.env* ./

# Copy public assets if they exist
RUN if [ -d "/app/public" ]; then cp -r /app/public/* /public/; fi

# FIX: Removed symlink creation - no longer necessary with corrected build output
# The tsconfig.server.json 'rootDir' fix ensures workers are compiled directly to /app/dist/server/workers

# Verify the build output
# Verify the build output
RUN echo "Build output verification:" && \
    echo "\nServer files in /app/dist/:" && ls -la /app/dist/ && \
    echo "\nServer files in /app/dist/server/:" && ls -la /app/dist/server/ 2>/dev/null || echo "No server files found in /app/dist/server/" && \
    echo "\nWorkers in /app/dist/server/workers/:" && ls -la /app/dist/server/workers/ 2>/dev/null || echo "No workers in /app/dist/server/workers/" && \
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

# Set NODE_OPTIONS to enable ES modules
ENV NODE_OPTIONS="--experimental-modules --es-module-specifier-resolution=node"

# Start the application using the resolved entry point
CMD ["node", "--experimental-modules", "--es-module-specifier-resolution=node", "/app/dist/server/server/index.js"]