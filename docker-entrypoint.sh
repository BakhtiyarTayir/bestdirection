#!/bin/sh
set -e

# Миграции накатываются при каждом старте контейнера: prisma migrate deploy
# идемпотентен — применяет только те, которых ещё нет в БД.
echo "→ prisma migrate deploy"
node node_modules/prisma/build/index.js migrate deploy

exec "$@"
