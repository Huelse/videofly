FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @videofly/server prisma:generate \
  && pnpm --filter @videofly/server build

EXPOSE 3000

CMD ["sh", "server/scripts/docker-entrypoint.sh"]
