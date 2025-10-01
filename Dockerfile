# Stage 1: Build Stage
FROM node:20-alpine AS builder

# Set environment to production
ENV NODE_ENV=production

# Create app directory and set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first for better layer caching
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY public/ ./public/

# Install all dependencies (including devDependencies) for building
RUN npm ci --include=dev

# Copy the rest of the application source code
COPY . .

# Verify files are in place
RUN echo "Current directory: $(pwd)" && ls -la
RUN echo "Checking for index.html: " && [ -f "/app/index.html" ] && echo "index.html found" || echo "index.html not found!"

# Build the application for production
RUN npm run build:client && npm run build:server

# Stage 2: Production Stage
FROM node:20-alpine
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache wget

# Copy built files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Clean up devDependencies and install only production dependencies
RUN npm prune --production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Expose the app port
EXPOSE 3001

# Start the application
CMD ["node", "dist/server/index.js"]