#!/bin/bash
set -e

cd /home/bakhtiyar/Projects/lms

PORT="${PORT:-3001}"
LOCAL_IP="$(ip route get 1.1.1.1 | awk '/src/ {for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"

if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="127.0.0.1"
fi

echo "Запуск базы данных и Piston..."
docker compose up -d db piston

echo "Применение миграций..."
npx prisma migrate deploy

echo "Сборка проекта..."
npm run build

echo "Запуск приложения на порту ${PORT}..."
nohup sh -c "cd /home/bakhtiyar/Projects/lms && AUTH_URL='http://${LOCAL_IP}:${PORT}' NEXTAUTH_URL='http://${LOCAL_IP}:${PORT}' HOSTNAME='0.0.0.0' PORT='${PORT}' node .next/standalone/server.js" > /tmp/lms-server.log 2>&1 &
APP_PID=$!

sleep 2

if ! kill -0 "${APP_PID}" 2>/dev/null; then
  echo "Не удалось запустить приложение. Проверьте лог: /tmp/lms-server.log"
  tail -n 20 /tmp/lms-server.log || true
  exit 1
fi

echo "Готово!"
echo "Локально: http://localhost:${PORT}"
echo "По Wi-Fi: http://${LOCAL_IP}:${PORT}"
echo "Лог запуска: /tmp/lms-server.log"
