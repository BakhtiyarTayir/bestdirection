#!/bin/sh
# Бэкап базы Best Direction на том же сервере.
#
#   /opt/bestdirection/backup-db.sh [метка]      метка: nightly, pre-deploy-<sha>, manual
#
# Сжатый дамп (pg_dump -Fc) ложится в /opt/bestdirection/backups, дампы старше
# 14 дней удаляются. Запускается ночью таймером bestdirection-backup.timer и
# перед каждым деплоем — до того, как новый контейнер накатит миграции.
#
# Бэкапы лежат на том же сервере (решение владельца 2026-09-17): они спасают
# от неудачной миграции и ошибочного удаления, но не от потери сервера.
#
# Восстановление (перезаписывает текущие данные — сначала снять свежий бэкап):
#   cd /opt/bestdirection
#   docker compose exec -T db pg_restore -U bestdirection -d bestdirection \
#     --clean --if-exists --no-owner < backups/<файл>.dump
set -eu

cd "$(dirname "$0")"
LABEL=${1:-manual}
DIR=backups
KEEP_DAYS=14

# В дампе телефоны и email учеников — читать только root
umask 077
mkdir -p "$DIR"

FILE="$DIR/bestdirection-$(date +%Y%m%d-%H%M%S)-$LABEL.dump"
docker compose exec -T db pg_dump -U bestdirection -d bestdirection -Fc > "$FILE.tmp"
# Пустой файл значит, что дамп не удался, даже если команда вернула 0
if [ ! -s "$FILE.tmp" ]; then
  rm -f "$FILE.tmp"
  echo "бэкап не удался: пустой дамп" >&2
  exit 1
fi
mv "$FILE.tmp" "$FILE"

find "$DIR" -name 'bestdirection-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$DIR" -name '*.tmp' -mtime +1 -delete

echo "бэкап: $FILE ($(du -h "$FILE" | cut -f1))"
