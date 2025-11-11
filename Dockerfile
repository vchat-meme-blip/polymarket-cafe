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

# Copy the rest of the application and build
COPY . .
RUN npm run build:client && npm run build:server && npm run postbuild:server

# ---- Production Stage ----
FROM node:22-alpine

# Install runtime dependencies
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env* ./
COPY --from=builder /app/ecosystem.config.* ./

# Fix directory structure for Sliplane
RUN if [ -d "/app/dist/server" ]; then \
      # If there's a nested server directory, move its contents up
      if [ -d "/app/dist/server/server" ]; then \
        mv /app/dist/server/server/* /app/dist/server/ 2>/dev/null || true; \
        rmdir /app/dist/server/server 2>/dev/null || true; \
      fi; \
      # Ensure the server directory is in the right place
      mkdir -p /app/dist; \
      mv /app/dist/server/* /app/dist/ 2>/dev/null || true; \
      rmdir /app/dist/server 2>/dev/null || true; \
    fi

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]