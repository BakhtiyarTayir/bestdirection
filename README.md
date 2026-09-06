# Best Direction

CRM для центра изучения английского языка.

## Стек

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + Radix UI + lucide-react
- **Prisma 6** + PostgreSQL
- **NextAuth v5** (Prisma adapter)
- **next-intl** — локализация (ru / uz), роуты через `src/app/[locale]`
- **grammy** — Telegram-бот
- **Upstash Redis** — rate limiting

## Запуск

```bash
npm install
cp .env.example .env   # заполнить DATABASE_URL, AUTH_SECRET и остальные ключи
npx prisma migrate dev
npm run db:seed
npm run dev            # http://localhost:3010
```

## Скрипты

| Команда | Описание |
| --- | --- |
| `npm run dev` | dev-сервер на порту 3010 |
| `npm run build` | production-сборка |
| `npm run start` | запуск собранного приложения |
| `npm run lint` | ESLint |
| `npm run db:migrate` | применить миграции Prisma |
| `npm run db:seed` | наполнить БД тестовыми данными |
| `npm run db:reset` | сбросить БД и пересоздать |

## Docker

```bash
docker compose up -d              # dev
docker compose -f docker-compose.prod.yml up -d   # prod
```
