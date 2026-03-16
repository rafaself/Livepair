# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/shared-types/package.json packages/shared-types/tsconfig.json ./packages/shared-types/

RUN pnpm install --frozen-lockfile

COPY apps/api/src ./apps/api/src
COPY packages/shared-types/src ./packages/shared-types/src

RUN pnpm --filter @livepair/shared-types build \
  && pnpm --filter @livepair/api build \
  && pnpm --filter @livepair/api deploy --prod /prod/api \
  && find /prod/api/dist -type f -name '*.spec.*' -delete


FROM build AS migrator

CMD ["pnpm", "--filter", "@livepair/api", "db:migrate"]


FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /prod/api/package.json ./package.json
COPY --from=build --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=build --chown=node:node /prod/api/dist ./dist

USER node

EXPOSE 8080

CMD ["node", "dist/main.js"]
