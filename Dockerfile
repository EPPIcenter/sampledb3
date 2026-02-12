# SampleDB - Multi-stage build
# Stage 1: Dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json ./
# Restrict workspaces to api, web, and docs (exclude e2e)
RUN bun -e "const p=require('./package.json'); p.workspaces=['packages/api','packages/web','packages/docs']; require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2))"
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/docs/package.json packages/docs/
RUN bun install

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
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/package.json ./packages/api/
COPY --from=build /app/packages/api/initial_schema.sql ./packages/api/

COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/packages/docs/dist ./packages/docs/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "packages/api/dist/index.js"]
