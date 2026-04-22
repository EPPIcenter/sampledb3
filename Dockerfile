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
COPY packages/web/package.json packages/web/
COPY packages/docs/package.json packages/docs/
COPY packages/e2e/package.json packages/e2e/
# --ignore-scripts skips postinstalls (e.g. @playwright/test in the e2e
# workspace tries to download browsers, which fails on alpine and isn't
# needed for the api/web/docs build).
RUN bun install --frozen-lockfile --ignore-scripts

# Stage 2: Build
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=deps /app/packages/docs/node_modules ./packages/docs/node_modules
COPY . .
RUN bun run build:api && bun run build:web && bun run build:docs

# Stage 3: Runtime
FROM oven/bun:1-alpine AS runtime
RUN apk add --no-cache sqlite

WORKDIR /app
# Production deps for module resolution at runtime
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/api/node_modules ./packages/api/node_modules

COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/package.json ./packages/api/
COPY --from=build /app/packages/api/initial_schema.sql ./packages/api/

COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/packages/docs/dist ./packages/docs/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run the API `start` script (same as root `bun run start`); avoid root workspace filter because e2e is not copied into the image.
WORKDIR /app/packages/api
CMD ["bun", "run", "start"]
