# =============================================================================
# Riley Recruiter - Production Dockerfile
# =============================================================================
# Multi-stage build for optimal image size and security

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 3: Runner
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 riley && \
    adduser --system --uid 1001 riley

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy necessary files
COPY --from=builder --chown=riley:riley /app/dist ./dist
COPY --from=builder --chown=riley:riley /app/node_modules ./node_modules
COPY --from=builder --chown=riley:riley /app/package.json ./package.json
COPY --from=builder --chown=riley:riley /app/prisma ./prisma

# Switch to non-root user
USER riley

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start command
CMD ["node", "dist/index.js"]
