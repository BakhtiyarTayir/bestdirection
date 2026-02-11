#!/bin/sh
set -e

# Run migrations on startup
npx prisma migrate deploy

exec "$@"
