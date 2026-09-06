#!/bin/sh
set -e

# Миграции накатываются при каждом старте: prisma migrate deploy идемпотентен,
# применяет только те, которых ещё нет в БД. CLI лежит вне node_modules
# приложения — см. комментарий в Dockerfile.
echo "→ prisma migrate deploy"
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy \
  --schema=/app/prisma/schema.prisma

exec "$@"
