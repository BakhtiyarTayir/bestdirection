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
# Только клиент web: у api свой генератор и свой образ
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
# Ни схемы, ни Prisma CLI: с этапа 9 web с базой не разговаривает — всё
# через api, он же накатывает миграции при старте.

# Ensure uploads + Next.js image cache dirs exist and are writable by the app user.
# /app/uploads — приватные файлы (сдачи ДЗ), НЕ раздаются статикой
RUN mkdir -p /app/public/uploads /app/uploads /app/.next/cache \
    && chown -R nextjs:nodejs /app/public/uploads /app/uploads /app/.next/cache

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
