# ---- Builder stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for better cache
COPY package.json package-lock.json* ./

# Install all deps (including devDependencies for build)
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy dependency manifests and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Create directory for SQLite database with proper permissions
RUN mkdir -p /app/data && chown appuser:appgroup /app/data

# Switch to non-root user
USER appuser

# Expose backend port
EXPOSE 3000

# Health check against a lightweight GET endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/contents || exit 1

# Start the application
CMD ["node", "dist/main.js"]
