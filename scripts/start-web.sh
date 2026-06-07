#!/bin/bash
set -e

echo "[startup] Syncing database schema..."
npx prisma db push --accept-data-loss --schema prisma/schema.prisma 2>&1 || {
  echo "[startup] WARNING: Database push failed, tables may not exist yet"
}

# Start the appropriate service
if [ "$SERVICE_ROLE" = "worker" ]; then
  echo "[startup] Starting Worker..."
  exec npx tsx src/worker/image-generation-worker.ts
else
  echo "[startup] Starting Web Server..."
  exec node server.js
fi
