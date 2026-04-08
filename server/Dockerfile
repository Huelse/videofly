ARG DOCKER_REGISTRY_MIRROR=docker.m.daocloud.io
FROM ${DOCKER_REGISTRY_MIRROR}/library/node:22-bookworm-slim

ARG PNPM_REGISTRY=https://registry.npmmirror.com
ARG APT_MIRROR_BASE=http://mirrors.aliyun.com/debian
ARG APT_SECURITY_MIRROR=http://mirrors.aliyun.com/debian-security

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable
RUN sed -i "s|http://deb.debian.org/debian|${APT_MIRROR_BASE}|g; s|http://deb.debian.org/debian-security|${APT_SECURITY_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN pnpm config set registry "${PNPM_REGISTRY}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @videofly/server prisma:generate \
  && pnpm --filter @videofly/server build

EXPOSE 3000

CMD ["sh", "server/scripts/docker-entrypoint.sh"]
