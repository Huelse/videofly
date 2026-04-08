#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@42.121.218.102}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/platform-eng-2.pem}"
REMOTE_DIR="${REMOTE_DIR:-/opt/videofly}"
DOMAIN="${DOMAIN:-videofly.oini.top}"
DOCKER_REGISTRY_MIRROR="${DOCKER_REGISTRY_MIRROR:-docker.m.daocloud.io}"
PNPM_REGISTRY="${PNPM_REGISTRY:-https://registry.npmmirror.com}"
APT_MIRROR_BASE="${APT_MIRROR_BASE:-http://mirrors.aliyun.com/debian}"
APT_SECURITY_MIRROR="${APT_SECURITY_MIRROR:-http://mirrors.aliyun.com/debian-security}"
SSH_OPTS=("-i" "$SSH_KEY" "-o" "StrictHostKeyChecking=accept-new")
RSYNC_RSH="ssh ${SSH_OPTS[*]}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

if [[ ! -f ".env" ]]; then
  echo "Missing .env in project root" >&2
  exit 1
fi

LETSENCRYPT_EMAIL="$(grep -E '^LETSENCRYPT_EMAIL=' .env | tail -n 1 | cut -d '=' -f 2- | tr -d '"')"
if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
  echo "Missing LETSENCRYPT_EMAIL in .env" >&2
  exit 1
fi

echo "Creating remote directory: $REMOTE_DIR"
ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR'"

echo "Syncing project files to $REMOTE_HOST:$REMOTE_DIR"
rsync -az --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "**/node_modules" \
  --exclude "dist" \
  --exclude "**/dist" \
  --exclude "coverage" \
  --exclude "**/coverage" \
  -e "$RSYNC_RSH" \
  ./ "$REMOTE_HOST:$REMOTE_DIR/"

echo "Starting stack with temporary HTTP config"
ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "cd '$REMOTE_DIR' \
  && export DOCKER_REGISTRY_MIRROR='$DOCKER_REGISTRY_MIRROR' \
  && export PNPM_REGISTRY='$PNPM_REGISTRY' \
  && export APT_MIRROR_BASE='$APT_MIRROR_BASE' \
  && export APT_SECURITY_MIRROR='$APT_SECURITY_MIRROR' \
  && cp deploy/nginx/http.conf deploy/nginx/active.conf \
  && docker compose up -d --build postgres server client nginx"

echo "Requesting or renewing Let's Encrypt certificate for $DOMAIN"
ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "cd '$REMOTE_DIR' \
  && export DOCKER_REGISTRY_MIRROR='$DOCKER_REGISTRY_MIRROR' \
  && export PNPM_REGISTRY='$PNPM_REGISTRY' \
  && export APT_MIRROR_BASE='$APT_MIRROR_BASE' \
  && export APT_SECURITY_MIRROR='$APT_SECURITY_MIRROR' \
  && docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
    -d '$DOMAIN' \
    --email '$LETSENCRYPT_EMAIL' \
    --agree-tos \
    --no-eff-email \
    --keep-until-expiring"

echo "Switching Nginx to HTTPS config"
ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "cd '$REMOTE_DIR' \
  && export DOCKER_REGISTRY_MIRROR='$DOCKER_REGISTRY_MIRROR' \
  && export PNPM_REGISTRY='$PNPM_REGISTRY' \
  && export APT_MIRROR_BASE='$APT_MIRROR_BASE' \
  && export APT_SECURITY_MIRROR='$APT_SECURITY_MIRROR' \
  && cp deploy/nginx/https.conf deploy/nginx/active.conf \
  && docker compose up -d nginx \
  && docker compose exec -T nginx nginx -s reload"

echo "Deployment completed."
