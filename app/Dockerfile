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
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV NEXT_TELEMETRY_DISABLED=1
# Pages are fully dynamic (no static generation), but Next.js build
# still type-checks server components that import the ClickHouse client.
# Provide a dummy URL so the build doesn't fail on missing env vars.
ENV CLICKHOUSE_URL=""
RUN npm run build --workspace=app

# Stage 3: Production runtime
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
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
