# ---- Builder Stage ----
# This stage is used to install dependencies and build the application
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies for a cleaner and faster build
RUN npm ci --omit=dev --no-audit --no-fund

# Copy the rest of the application code
COPY . .

# ---- Production Stage ----
# This stage is the final image that will be run
FROM node:20-alpine
WORKDIR /app

# Install curl for healthchecks and other necessary tools
RUN apk --no-cache add curl

# Create a non-root user for security
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Copy node_modules and application code from the builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app ./

# Create necessary directories
USER root
RUN mkdir -p sessions uploads && \
    chown -R nodejs:nodejs /app/sessions /app/uploads
USER nodejs

# Set NODE_ENV to production
ENV NODE_ENV=production

# Expose port and run the application
EXPOSE 3000

# Use a healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use node directly instead of npm to reduce overhead
CMD ["node", "index.js"]