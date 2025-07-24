# ---- Builder Stage ----
# This stage is used to install dependencies and build the application
FROM node:20 AS builder
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies for a cleaner and faster build
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# ---- Production Stage ----
# This stage is the final image that will be run
FROM node:20-slim
WORKDIR /app

# Install curl for healthchecks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
USER nodejs

# Copy node_modules and application code from the builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app ./

# Create necessary directories
# Run as root before switching user
USER root
RUN mkdir -p sessions uploads && \
    chown -R nodejs:nodejs /app/sessions /app/uploads
USER nodejs

# Expose port and run the application
EXPOSE 3000
CMD ["node", "index.js"]