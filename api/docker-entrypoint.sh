#!/bin/sh
set -e

# Миграции накатываются при каждом старте: prisma migrate deploy идемпотентен,
# применяет только те, которых ещё нет в БД. CLI приезжает вместе с
# зависимостями: он необязательный peer @prisma/client.
echo "→ prisma migrate deploy"
node ./node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma

exec "$@"
