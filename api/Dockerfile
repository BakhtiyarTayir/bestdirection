# Образ api (NestJS). Собирается в GitHub Actions, на сервер приезжает готовым.
# Контекст сборки — корень репозитория: схема Prisma общая с web.
#   docker build -f api/Dockerfile .
# Что попадает в контекст — api/Dockerfile.dockerignore.

FROM node:22-alpine AS deps
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/api/node_modules ./api/node_modules
COPY prisma ./prisma
COPY api ./api
WORKDIR /app/api
# Клиент генерируется здесь, на alpine, — с движком под musl
RUN npm run prisma:generate \
 && npm run build

# Только прод-зависимости. Без скриптов: postinstall @prisma/client пытался бы
# генерировать клиент, а он уже в generated/.
# Известный хвост: prisma CLI и typescript — необязательные peer у
# @prisma/client, и npm ставит их с зависимостями (~170 МБ образа). Чисто
# отрезать их средствами npm не вышло; слой переиспользуется между деплоями,
# пока зависимости не меняются.
FROM node:22-alpine AS prod-deps
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=4000
# Контейнер ограничен 200 МБ: куча V8 меньше лимита, чтобы Node собирал мусор,
# а не упирался в OOM-kill. Остальное — движок Prisma и буферы.
ENV NODE_OPTIONS=--max-old-space-size=128
WORKDIR /app/api

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs api

COPY --from=builder --chown=api:nodejs /app/api/package.json ./
COPY --from=prod-deps --chown=api:nodejs /app/api/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /app/api/generated ./generated
COPY --from=builder --chown=api:nodejs /app/api/dist ./dist

USER api
EXPOSE 4000

# Миграций здесь нет: до этапа 9 ими владеет web (docker-entrypoint.sh).
# Два параллельных migrate deploy — гонка.
CMD ["node", "dist/main.js"]
