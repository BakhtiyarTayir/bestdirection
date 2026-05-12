#!/bin/bash
# Устанавливает языковые рантаймы в self-hosted Piston
PISTON_URL="${PISTON_API_URL:-http://localhost:2000/api/v2}"

echo "Piston URL: $PISTON_URL"

curl_retry() {
  local url="$1"
  shift || true
  curl -fsS --retry 8 --retry-all-errors --retry-delay 2 --max-time 30 "$url" "$@"
}

# Дождаться готовности Piston
echo "Ожидание готовности Piston..."
until curl_retry "$PISTON_URL/runtimes" > /dev/null 2>&1; do
  sleep 2
done
echo "Piston готов!"

# Установить языки
languages=(
  '{"language":"python","version":"3.10"}'
  '{"language":"node","version":"18.15.0"}'
  '{"language":"typescript","version":"5.0.3"}'
  '{"language":"php","version":"8.2.3"}'
  '{"language":"java","version":"15.0.2"}'
  '{"language":"mono","version":"6.12.0"}'
)

for lang in "${languages[@]}"; do
  name=$(echo "$lang" | grep -oP '"language":"\K[^"]+')
  version=$(echo "$lang" | grep -oP '"version":"\K[^"]+')
  echo "Установка $name $version..."
  if result=$(curl_retry "$PISTON_URL/packages" \
      -X POST \
      -H "Content-Type: application/json" \
      -d "$lang" 2>/dev/null); then
    echo "  $result"
  else
    echo "  [warn] Не удалось установить $name $version (пропускаем)"
  fi
done

echo ""
echo "Установленные рантаймы:"
if runtimes=$(curl_retry "$PISTON_URL/runtimes" 2>/dev/null); then
  echo "$runtimes" | python3 -m json.tool 2>/dev/null || echo "$runtimes"
else
  echo "[warn] Не удалось получить список рантаймов"
fi
