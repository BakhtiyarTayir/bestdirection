# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Raise V8 heap limit so the build survives on low-RAM hosts (swap-backed).
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy self-contained standalone output (bundles its own minimal node_modules).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Схема и миграции + CLI Prisma: entrypoint накатывает migrate deploy при старте.
# Standalone-сборка тянет только @prisma/client, поэтому CLI копируем отдельно.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Ensure uploads + Next.js image cache dirs exist and are writable by the app user.
# /app/uploads — приватные файлы (сдачи ДЗ), НЕ раздаются статикой
RUN mkdir -p /app/public/uploads /app/uploads /app/.next/cache \
    && chown -R nextjs:nodejs /app/public/uploads /app/uploads /app/.next/cache

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
