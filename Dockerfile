# ── Stage 1: BUILD ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Mirror monorepo layout so file: deps resolve:
#   /build/rideglory-contracts/
#   /build/api-gateway/          ← WORKDIR
WORKDIR /build/api-gateway

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY rideglory-contracts ../rideglory-contracts

COPY api-gateway/package.json api-gateway/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY api-gateway/ .
RUN pnpm build

# ── Stage 2: RUNTIME ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /build/api-gateway

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY rideglory-contracts ../rideglory-contracts

COPY api-gateway/package.json api-gateway/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

COPY --from=builder /build/api-gateway/dist ./dist
COPY api-gateway/healthcheck.js ./healthcheck.js

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "dist/main"]
