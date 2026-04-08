#!/bin/sh

set -eu

echo "Waiting for PostgreSQL to accept connections..."
node <<'EOF'
const net = require("node:net");

const databaseUrl = new URL(process.env.DATABASE_URL);
const host = databaseUrl.hostname;
const port = Number(databaseUrl.port || 5432);
const maxAttempts = 60;
const retryDelayMs = 2000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function check(attempt = 1) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve();
    });

    socket.setTimeout(3000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    socket.on("error", reject);
  }).catch(async (error) => {
    if (attempt >= maxAttempts) {
      throw error;
    }

    console.log(`PostgreSQL not ready (${attempt}/${maxAttempts}), retrying...`);
    await wait(retryDelayMs);
    await check(attempt + 1);
  });
}

check().catch((error) => {
  console.error("Failed to connect to PostgreSQL:", error);
  process.exit(1);
});
EOF

echo "Running Prisma migrations..."
pnpm --filter @videofly/server exec prisma migrate deploy

echo "Starting API server..."
exec pnpm --filter @videofly/server start
