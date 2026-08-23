FROM node:20-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=768
RUN pnpm build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3300
ENV HOSTNAME=0.0.0.0
ENV NODE_PATH=/usr/local/lib/node_modules
RUN groupadd --system --gid 1001 dwrg && useradd --system --uid 1001 --gid dwrg dwrg
RUN npm install --global tsx@4.23.11 drizzle-orm@0.45.2 postgres@3.4.9
COPY --from=builder --chown=dwrg:dwrg /app/.next/standalone ./
COPY --from=builder --chown=dwrg:dwrg /app/.next/static ./.next/static
COPY --from=builder --chown=dwrg:dwrg /app/public ./public
COPY --from=builder --chown=dwrg:dwrg /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=dwrg:dwrg /app/drizzle ./drizzle
COPY --from=builder --chown=dwrg:dwrg /app/scripts ./scripts
COPY --from=builder --chown=dwrg:dwrg /app/lib ./lib
COPY --from=builder --chown=dwrg:dwrg /app/data ./data
COPY --from=builder --chown=dwrg:dwrg /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /app/uploads && chown -R dwrg:dwrg /app/uploads
USER dwrg
EXPOSE 3300
HEALTHCHECK --interval=20s --timeout=5s --start-period=45s CMD ["node", "scripts/healthcheck.mjs"]
CMD ["sh", "-c", "tsx scripts/migrate.ts && tsx scripts/seed.ts && node server.js"]
