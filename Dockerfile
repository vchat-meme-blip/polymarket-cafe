# Stage 1: Build Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Verify files are in place
RUN echo "Current directory: $(pwd)" && ls -la
RUN echo "Root directory contents:" && ls -la /

# Set the working directory explicitly for the build
WORKDIR /app

# Build the application
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

# Install only production dependencies
RUN npm ci --only=production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

EXPOSE 3001
CMD ["node", "dist/server/index.js"]