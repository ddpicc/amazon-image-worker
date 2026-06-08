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
  echo "[startup] Starting Web Server on port ${PORT:-3001}..."

  if [ -f ".next/standalone/server.js" ]; then
    mkdir -p .next/standalone/.next/static
    if [ -d ".next/static" ]; then
      cp -R .next/static/. .next/standalone/.next/static/
    fi

    if [ -d "public" ]; then
      mkdir -p .next/standalone/public
      cp -R public/. .next/standalone/public/
    fi

    export PORT=${PORT:-3001}
    export HOSTNAME=0.0.0.0
    exec node .next/standalone/server.js
  fi

  exec npx next start -p ${PORT:-3001} -H 0.0.0.0
fi
