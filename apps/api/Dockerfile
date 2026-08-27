# syntax=docker/dockerfile:1
# ---- Multi-stage build for the NestJS API ---------------------------------

# 1. Install workspace dependencies (root + api + shared-types).
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci

# 2. Build: generate the Prisma client and compile TypeScript.
FROM node:22-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
WORKDIR /repo/apps/api
RUN npx prisma generate
RUN npm run build

# 3. Runtime: slim image with only what's needed to run.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/prisma.config.ts ./apps/api/
COPY packages ./packages
USER nestjs
WORKDIR /repo/apps/api
EXPOSE 3000
# Apply migrations, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
