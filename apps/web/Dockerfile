# syntax=docker/dockerfile:1
# ---- Multi-stage build for the Angular SPA served by nginx ----------------

# 1. Install workspace dependencies.
FROM node:22.22.3-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm install

# 2. Build the production bundle.
FROM node:22.22.3-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY package.json turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web
WORKDIR /repo/apps/web
RUN npm run build

# 3. Serve with nginx.
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080 || exit 1
