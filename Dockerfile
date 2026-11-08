FROM node:24-slim
WORKDIR /srv
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/agent-core/package.json packages/agent-core/
COPY services/core-bank/package.json services/core-bank/
COPY services/bridge/package.json services/bridge/
COPY services/agent/package.json services/agent/
COPY services/gateway/package.json services/gateway/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @gas/web build
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "scripts/start-prod.mjs"]
