# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY pipeline/package.json pipeline/
COPY infra/package.json infra/
RUN npm ci

# Stage 2: Build the Next.js app
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ARG SENTRY_AUTH_TOKEN
ARG NEXT_PUBLIC_COMMIT_SHA
ARG SENTRY_DSN_CRT_FRONTEND
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA
ENV SENTRY_DSN_CRT_FRONTEND=$SENTRY_DSN_CRT_FRONTEND
ENV NEXT_TELEMETRY_DISABLED=1
# Pages use ISR (revalidate=300). During build, the query() helper detects
# NEXT_PHASE=phase-production-build and returns empty arrays, so pre-renders
# succeed without ClickHouse. Real data is fetched on first request.
# Provide a dummy URL so the ClickHouse client constructor doesn't fail.
ENV CLICKHOUSE_URL=""
RUN npm run build --workspace=app

# Stage 3: Production runtime
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Git SHA for Sentry release tracking (baked in at build time via NEXT_PUBLIC_*)
ARG NEXT_PUBLIC_COMMIT_SHA
ENV NEXT_PUBLIC_COMMIT_SHA=${NEXT_PUBLIC_COMMIT_SHA}
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Next.js standalone output in a monorepo places everything under
# app/.next/standalone/ with the full workspace directory structure.
# server.js is at app/.next/standalone/app/server.js.
COPY --from=build /app/app/.next/standalone ./
COPY --from=build /app/app/.next/static ./app/.next/static
COPY --from=build /app/app/public ./app/public

EXPOSE 8080
CMD ["node", "app/server.js"]
