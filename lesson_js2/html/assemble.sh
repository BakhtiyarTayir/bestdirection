#!/bin/bash
# assemble.sh <номер> <title>
set -e
D="$(dirname "$0")"
N="$1"; TITLE="$2"
{
  printf '%s\n' '<!DOCTYPE html>' '<html lang="ru">' '<head>' \
    '<meta charset="UTF-8">' \
    '<meta name="viewport" content="width=device-width, initial-scale=1">' \
    "<title>${TITLE}</title>" \
    '<link rel="preconnect" href="https://fonts.googleapis.com">' \
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' \
    '<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">'
  cat "$D/_shared.css.html"
  printf '%s\n' '</head>' '<body>'
  cat "$D/${N}.body.html"
  printf '%s\n' '</body>' '</html>'
} > "$D/${N}.html"
echo "собран ${N}.html: $(wc -c < "$D/${N}.html") байт"
