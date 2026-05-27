# syntax=docker/dockerfile:1.4
# SampleDB - Multi-stage build
# Stage 1: Dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app
# Copy the lockfile so the image installs the exact same dependency
# versions that pass typecheck locally; otherwise `bun install` resolves
# fresh and may pull in newer minor releases (e.g. hono) whose stricter
# types break the build.
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/contract/package.json packages/contract/
COPY packages/web/package.json packages/web/
COPY packages/docs/package.json packages/docs/
COPY packages/e2e/package.json packages/e2e/
# --ignore-scripts skips postinstalls (e.g. @playwright/test in the e2e
# workspace tries to download browsers, which fails on alpine and isn't
# needed for the api/web/docs build).
# Cache the Bun install cache so dependency-only changes reuse downloads across builds.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

# Stage 2: Build
# APP_BUILD_ID is baked into the web bundle (VITE_*) and read at API runtime; pass via --build-arg in CI.
FROM oven/bun:1-alpine AS build
ARG APP_BUILD_ID=dev
ENV APP_BUILD_ID=$APP_BUILD_ID
ENV VITE_APP_BUILD_ID=$APP_BUILD_ID
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/contract/node_modules ./packages/contract/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=deps /app/packages/docs/node_modules ./packages/docs/node_modules
COPY . .
# `bun run build` runs workspace builds in parallel (e2e has no `build` script); faster wall-clock than a chained `&&` sequence.
RUN bun run build

# Stage 3: Runtime (re-declare APP_BUILD_ID so the final image has the same id as the embedded web bundle)
FROM oven/bun:1-alpine AS runtime
ARG APP_BUILD_ID=dev
ENV APP_BUILD_ID=$APP_BUILD_ID
RUN apk add --no-cache sqlite

WORKDIR /app
# Production deps for module resolution at runtime
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/api/node_modules ./packages/api/node_modules

COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/package.json ./packages/api/
COPY --from=build /app/packages/api/initial_schema.sql ./packages/api/

COPY --from=build /app/packages/contract ./packages/contract
COPY --from=build /app/packages/contract/node_modules ./packages/contract/node_modules

COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/packages/docs/dist ./packages/docs/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run the API `start` script (same as root `bun run start`); avoid root workspace filter because e2e is not copied into the image.
WORKDIR /app/packages/api
CMD ["bun", "run", "start"]
