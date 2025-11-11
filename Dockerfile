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
RUN apk add --no-cache libusb udev curl

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy package files and install only production dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Create necessary directories
RUN mkdir -p /app/dist/workers /app/dist/server/workers /app/logs /app/dist/client

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env* ./
COPY --from=builder /app/ecosystem.config.* ./

# Fix any nested server directory
RUN if [ -d "/app/dist/server/server" ]; then \
      mv /app/dist/server/server/* /app/dist/server/ 2>/dev/null || true; \
      rmdir /app/dist/server/server 2>/dev/null || true; \
    fi

# Set the entry point
CMD ["node", "dist/server/index.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

EXPOSE ${PORT}