FROM node:22-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm --filter @videofly/client build

FROM nginx:1.27-alpine

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
