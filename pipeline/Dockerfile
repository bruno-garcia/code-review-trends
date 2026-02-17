# Stage 1: Build the pipeline
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY pipeline/package.json pipeline/
COPY infra/package.json infra/
RUN npm ci
COPY pipeline/ pipeline/
COPY db/init/ db/init/
RUN npm run build --workspace=pipeline

# Stage 2: Production runtime
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy package files for workspace-aware npm ci
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/pipeline/package.json pipeline/
COPY --from=build /app/app/package.json app/
COPY --from=build /app/infra/package.json infra/
RUN npm ci --omit=dev --workspace=pipeline

# Copy build output and runtime assets
COPY --from=build /app/pipeline/dist/ pipeline/dist/
COPY --from=build /app/pipeline/schedules.json pipeline/
COPY --from=build /app/db/init/ db/init/

ENTRYPOINT ["node", "pipeline/dist/cli.js"]
