# Daydock Dashboard - Nuxt 4 Docker Image
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

# Production image
FROM node:24-alpine

WORKDIR /app

# Copy built output
COPY --from=builder /app/.output /app/.output
COPY scripts/activity-report.mjs /app/scripts/activity-report.mjs

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
