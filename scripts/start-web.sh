#!/bin/bash
set -e

# Run database migrations on startup (first deploy creates tables)
npx prisma migrate deploy --schema prisma/schema.prisma 2>/dev/null || npx prisma db push --accept-data-loss --schema prisma/schema.prisma

# Start the appropriate service
if [ "$SERVICE_ROLE" = "worker" ]; then
  echo "Starting Worker..."
  exec npx tsx src/worker/image-generation-worker.ts
else
  echo "Starting Web Server..."
  exec node server.js
fi
