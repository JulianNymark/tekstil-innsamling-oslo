# syntax = docker/dockerfile:1

# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.26.2

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy application code (includes data/ingredients.db)
COPY . .

# Build application
RUN pnpm run build

# Stage 2: Serve
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.26.2

# Copy built application
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/data ./data

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Expose port
EXPOSE 3000

# Start Next.js server
CMD ["pnpm", "start"]
