# Multi-stage build for RankWrangler Server
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Enable corepack for latest yarn
RUN corepack enable

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./

# Install dependencies
RUN yarn install --immutable

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Production stage
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Set working directory
WORKDIR /app

# Enable corepack for latest yarn
RUN corepack enable

# Copy package files and install production dependencies
COPY package.json yarn.lock .yarnrc.yml ./
RUN NODE_ENV=production yarn install --immutable && yarn cache clean

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy migration files for runtime migrations
COPY --from=builder --chown=nodejs:nodejs /app/drizzle ./drizzle

# Switch to nodejs user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "http.get('http://localhost:8080/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Start the application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]