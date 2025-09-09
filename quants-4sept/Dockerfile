# Stage 1: Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the client (Vite)
RUN npm run build:client

# Build the server (TypeScript)
RUN npm run build:server


# Stage 2: Production Stage
FROM node:20-alpine

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy only necessary files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Expose the port the app runs on
EXPOSE 3001

# Start the application
CMD ["npm", "start"]