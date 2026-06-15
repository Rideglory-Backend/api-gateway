# ── Stage 1: BUILD ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /build
COPY rideglory-contracts ./rideglory-contracts
COPY rideglory-common-lib ./rideglory-common-lib

WORKDIR /build/rideglory-contracts
RUN npm install --ignore-scripts
RUN npm run build

WORKDIR /build/rideglory-common-lib
RUN npm install --ignore-scripts
RUN npm run build

WORKDIR /build/api-gateway
COPY api-gateway/package.json api-gateway/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY api-gateway/ .
RUN pnpm exec prisma generate
RUN pnpm build

# ── Stage 2: RUNTIME ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /build
COPY rideglory-contracts ./rideglory-contracts
COPY rideglory-common-lib ./rideglory-common-lib

WORKDIR /build/rideglory-contracts
RUN npm install --ignore-scripts
RUN npm run build

WORKDIR /build/rideglory-common-lib
RUN npm install --ignore-scripts
RUN npm run build

WORKDIR /build/api-gateway
COPY api-gateway/package.json api-gateway/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && pnpm store prune

COPY --from=builder /build/api-gateway/dist ./dist
COPY api-gateway/healthcheck.js ./healthcheck.js

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "dist/src/main"]
