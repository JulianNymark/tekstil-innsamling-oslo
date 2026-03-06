# syntax = docker/dockerfile:1

# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.26.2

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Build application (generates 'out' directory)
RUN pnpm run build

# Stage 2: Serve
FROM nginx:stable-alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=build /app/out /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
