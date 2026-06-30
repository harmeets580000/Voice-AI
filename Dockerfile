# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js (App Router) standalone server + Prisma client.
# Final image is a lean Debian-slim runtime that runs `node server.js` as a non-root user.

# ---- deps: install full dependency tree (needed to build) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Prisma's query engine needs OpenSSL present to pick the right binary at generate time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate Prisma client + produce the standalone build ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# src/server/config/env.ts validates env at import time and REQUIRES these two
# (z.string().min(1)). `next build` evaluates server modules, so supply dummy values
# here only — the real secrets are injected at runtime by Azure Container Apps and are
# never baked into the image. All other env vars default to "" and are fine at build.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    JWT_ACCESS_SECRET=build-time-placeholder \
    JWT_REFRESH_SECRET=build-time-placeholder
RUN npx prisma generate
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Run as an unprivileged user.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Standalone server bundle, static assets, and public files.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Safety net: ensure the generated Prisma client + query-engine binary are present
# in the standalone tree (Next's file tracing usually includes them, but the native
# engine binary is occasionally missed). Harmless if already traced.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
