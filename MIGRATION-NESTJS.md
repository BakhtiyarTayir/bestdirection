# Перенос бэкенда best-direction с Next.js Server Actions на NestJS

**Дата решения:** 2026-09-17
**Связанный документ:** `AUDIT-2026-09-17.md` в этой же папке — аудит текущего кода. Номера находок ниже (2.1, 3.4 и т.д.) ссылаются на него.

Этот документ — задание для агента, который будет вести перенос. Он самодостаточен: предыстория, целевая архитектура, порядок этапов, критерии готовности и известные ловушки.

---

## 0. Контекст

**Продукт.** CRM + LMS одного учебного центра в Узбекистане: ученики, родители, преподаватели, курсы, группы, уроки, тесты, домашние задания с автопроверкой кода, посещаемость, начисления и оплаты, SMS (Eskiz), Telegram-бот, публичный лендинг. Интерфейс на узбекском (по умолчанию) и русском.

**Текущий стек.** Next.js 16 (App Router), React 19, Server Actions как единственный транспорт между UI и данными, Prisma 6 + PostgreSQL 16, NextAuth v5 beta (JWT-сессии), Tailwind 4 + Radix/shadcn, next-intl, grammy, Piston для выполнения кода.

**Масштаб кода.** ~44 000 строк без сгенерированного кода, 25 файлов в `src/actions/` (~170 server actions), 21 API-роут, 33 миграции.

**Продакшен.** Один VPS (1 CPU, 956 МБ RAM), Docker Compose: `db` (256 МБ), `caddy` (128 МБ), `app` (512 МБ). Образ собирается в GitHub Actions и публикуется в GHCR, сервер только тянет образ. Миграции Prisma накатываются при каждом старте контейнера `app` (`docker-entrypoint.sh`).

**Разработчик один.** Это главное ограничение для всего плана.

### Почему переносим

Аудит показал системную проблему: **авторизация размазана по ~170 функциям вручную**, единой точки проверки нет.

- 8 server actions отдают контакты учеников любому авторизованному (2.3).
- Роль PARENT получает правильные ответы ко всем тестам, потому что проверки написаны как `role === "STUDENT"` (2.4).
- Один action вообще без аутентификации (2.5).
- Бизнес-правила живут в UI и обходятся прямым вызовом action (3.1, 3.2, 3.3).
- zod-схемы из `src/validators/` импортируются только как типы и на сервере не выполняются (1.3).
- Деактивация пользователя не действует до 30 дней из-за JWT без сверки с БД (2.1).

Server Actions выглядят как вызов функции, поэтому пропустить проверку легко, а поставить middleware некуда. NestJS даёт то, чего не хватает: глобальные guards с запретом по умолчанию, pipes для валидации, модули с явными границами, очереди.

### Цели

1. Авторизация проверяется в одном месте, маршрут без явных прав не компилируется в рабочий (отдаёт 403).
2. Входные данные валидируются на сервере всегда.
3. Бизнес-правила живут только на сервере.
4. Долгие операции (SMS, автопроверка кода, заморозка начислений) идут через очередь.
5. Каждый модуль покрыт тестом прав доступа.

### Не цели

- **Не меняем схему БД** в рамках переноса. Схема Prisma и данные остаются как есть.
- **Не меняем UI.** Страницы и компоненты остаются в Next.js.
- **Не вводим мультиарендность.** Это отдельный продукт на Spring Boot, см. `~/Projects/saas-crm/ARCHITECTURE-SAAS-SPRING.md`.
- **Не переписываем разом.** Только поэтапный перенос с рабочей версией на каждом шаге.

### Решения владельца (2026-09-17)

Эти решения приняты после первой версии документа и **имеют приоритет** над текстом ниже там, где он с ними расходится.

| Решение | Почему | Что меняется в плане |
|---|---|---|
| **VPS не увеличиваем** | Сейчас нет возможности. Замер прода 2026-09-17: `app` 189 МБ, `db` 36 МБ, `caddy` 33 МБ; свободно 594 МБ из 956, swap 2 ГБ. Цифра «2–4 ГБ» была нужна в основном под Piston | `api` получает лимит ~200 МБ. Раздел 8 «Память сервера» не действует |
| **Piston не поднимаем, задания CODE отключены** | Не влезает в память. В проде на 2026-09-17 нет ни одного домашнего задания | В этапе 0 тип CODE убирается из формы и импорта. Очереди `code-run` нет. Этап 5 закрывает 7.1 отключением, а не деплоем Piston |
| **Redis не поднимаем** | Экономия памяти; один инстанс `api` | Rate limiting — в памяти процесса. Очереди откладываются до этапа 6; кандидат — pg-boss поверх той же Postgres |
| **Бэкапы БД хранятся на том же сервере** | БД 11 МБ, отдельного хранилища нет | `pg_dump` ночью (таймер systemd, cron на сервере нет) и перед каждым деплоем, ротация 14 дней. Защищает от неудачной миграции и ошибочного удаления, **не** от потери сервера |
| **Уроки и ДЗ платных курсов закрыты для гостей** (находка 2.9) | Решение владельца | Делается в этапе 0. Все курсы в проде сейчас PAID, поэтому публичные страницы уроков фактически закрываются целиком; гость отправляется на вход |
| **Перенос `api/` в `~/Projects/lms` — в самом конце** | Сначала довести best-direction | Добавлен этап 10. До него lms не синхронизируется с изменениями переноса |

---

## 1. Этап 0 — сделать в текущем коде ДО начала переноса

**Статус 2026-09-17:** всё сделано в коде и проверено на собранном приложении с одноразовой базой; деплой в прод — по команде владельца. Коммиты `9cab156`…`4ba3a42`.

Перенос займёт месяцы. Эти дыры нельзя оставлять открытыми на всё это время. Делаются прямо в Next.js-коде.

**Безопасность (блок A аудита):**
- [x] 2.3 — добавить `{ roles: ["ADMIN", "TEACHER"] }` в `withAuth` у: `src/actions/group-actions.ts` `getAvailableStudentsForGroup`, `getUngroupedStudents`, `getGroupDetails`; `src/actions/course-actions.ts` `getEnrolledStudents`, `getCourseById`; `src/actions/attendance-actions.ts` `getAttendanceSessions`, `getAttendanceReport`; `src/actions/user-actions.ts` `getUserById`.
- [x] 2.5 — удалить `getAccessibleStudentIds` из `src/actions/parent-actions.ts`.
- [x] 2.2 — `src/app/api/homework/[homeworkId]/upload/route.ts`: убрать `.html` из разрешённых, MIME выводить из расширения, не из `file.type`. `src/app/api/files/[fileId]/route.ts`: для всего, кроме картинок, отдавать `application/octet-stream` + `Content-Disposition: attachment`. `src/app/uploads/[...path]/route.ts`: убрать `.svg`.
- [x] 2.6 — `npm audit fix` ради `@auth/core`, проверить вход.
- [x] 3.1 — дедупликация `answers` по `questionId` в `submitAssessmentAttempt`, `maxScore` считать только по `assessment.questions`.
- [x] 2.9 — публичные страницы уроков и ДЗ не показывают платные курсы, гость отправляется на вход.

**Эксплуатация:**
- [x] 7.1 — Piston отключён: убрать тип CODE из формы ДЗ и импорта, по умолчанию FILE.
- [x] 1.5 — `concurrency` в `.github/workflows/deploy.yml`.
- [x] Бэкап БД на сервере: `pg_dump` ночью и перед каждым деплоем, ротация 14 дней. Сейчас бэкапов нет, а миграции накатываются на каждом старте.

---

## 2. Целевая архитектура

```
                    ┌──────────────── Caddy ────────────────┐
  браузер ─────────▶│ /api/v2/*  → api:4000                  │
                    │ всё остальное → web:3000               │
                    └───────────────────────────────────────┘
                              │                    │
                   ┌──────────▼─────────┐  ┌───────▼─────────────┐
                   │ web (Next.js)      │  │ api (NestJS)        │
                   │ страницы, UI,      │  │ вся бизнес-логика,  │
                   │ лендинг            │──▶ права, валидация    │
                   │ НЕ ходит в БД      │  │                     │
                   └────────────────────┘  └──┬──────┬──────┬────┘
                                              │      │      │
                                        ┌─────▼┐ ┌───▼──┐ ┌─▼──────┐
                                        │ PG   │ │Redis │ │ Piston │
                                        └──────┘ └──────┘ └────────┘
```

**Конечное состояние:** `web` — только интерфейс, в его `package.json` нет Prisma. Всё, что трогает данные, — в `api`.

**Переходное состояние:** оба приложения работают с одной БД через одну схему Prisma. Модуль за модулем логика уходит из `src/actions/` в `api/`.

---

## 3. Структура репозитория

Next.js на время переноса **остаётся в корне** — чтобы не ломать Dockerfile, CI и слияния в `~/Projects/lms` (вторая копия проекта под брендом IT School official, получает изменения слиянием из best-direction; перед началом решить, переносится ли туда `api/` тоже).

```
best-direction/
├── prisma/
│   ├── schema.prisma          ← одна схема на оба приложения
│   └── migrations/
├── src/                       ← Next.js (web), как сейчас
├── api/                       ← NestJS, новое
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/
│   │   │   ├── auth/          SessionGuard, мост к Auth.js, @Public, @CurrentUser
│   │   │   ├── policies/      CASL: abilities, PoliciesGuard, @CheckPolicies
│   │   │   ├── security/      OriginGuard (CSRF), rate limiting
│   │   │   ├── prisma/        PrismaService (+ расширение soft-delete)
│   │   │   ├── validation/    ZodValidationPipe
│   │   │   ├── errors/        единый формат ошибок
│   │   │   ├── audit/         AuditService
│   │   │   ├── queue/         BullMQ
│   │   │   └── files/         стриминг загрузок, выдача файлов
│   │   ├── modules/
│   │   │   ├── users/
│   │   │   ├── courses/
│   │   │   ├── groups/
│   │   │   ├── attendance/
│   │   │   ├── parents/
│   │   │   ├── lessons/
│   │   │   ├── assessments/
│   │   │   ├── homework/
│   │   │   ├── uploads/
│   │   │   ├── notifications/  sms + telegram
│   │   │   ├── marketing/
│   │   │   └── billing/        billing + payments
│   ├── generated/prisma/       ← клиент Prisma для api (вне src: tsc не копирует его JS в dist)
│   ├── test/
│   ├── Dockerfile
│   └── package.json
└── ...
```

**Одна схема — два клиента.** В `prisma/schema.prisma` добавить второй генератор:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

generator apiClient {
  provider = "prisma-client-js"
  output   = "../api/generated/prisma"
}
```

**Миграциями владеет ровно одно приложение.** До этапа 9 — `web` (как сейчас, `docker-entrypoint.sh`). В entrypoint `api` миграций нет. На этапе 9 владение переходит к `api`. Никогда оба сразу: два параллельных `migrate deploy` — гонка.

---

## 4. Каркас api

### 4.1. Аутентификация в переходный период

Вход, регистрация и сессии пока остаются в NextAuth внутри `web`. `api` **читает ту же сессионную куку**.

Кука: `authjs.session-token` (по HTTP) или `__Secure-authjs.session-token` (по HTTPS). Это JWE, зашифрованный ключом из `AUTH_SECRET`; соль — имя куки. Расшифровывается функцией `decode` из `@auth/core/jwt` (для `req.cookies` нужен `cookie-parser`):

```ts
// api/src/common/auth/session.guard.ts (набросок)
import { decode } from "@auth/core/jwt";

const COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"];

async function readSession(req: Request) {
  for (const name of COOKIE_NAMES) {
    const token = req.cookies?.[name];
    if (!token) continue;
    const payload = await decode({ token, secret: process.env.AUTH_SECRET!, salt: name });
    if (payload) return payload; // payload.id и payload.role кладёт jwt-callback в src/lib/auth.ts
  }
  return null;
}
```

**Главное отличие от текущего кода:** guard **не доверяет роли из токена**. По `payload.id` он загружает пользователя из БД (кэш в памяти процесса на 30 секунд: Redis не поднимаем) и проверяет `isActive` и `deletedAt`. Роль берётся из БД. Так деактивация и смена роли действуют в пределах 30 секунд — находка 2.1 закрыта для всего, что уже переехало в `api`.

Проверить на старте реализации: точные имена куки и соль на проде (`AUTH_URL` на HTTPS → префикс `__Secure-`), совместимость версии `@auth/core` в `api` с версией в `web`.

### 4.2. Авторизация: запрет по умолчанию

```ts
// api/src/app.module.ts
providers: [
  { provide: APP_GUARD, useClass: ApiThrottlerGuard }, // частота запросов, см. 4.7
  { provide: APP_GUARD, useClass: OriginGuard },       // CSRF, см. 4.4
  { provide: APP_GUARD, useClass: SessionGuard },      // пропускает только @Public()
  { provide: APP_GUARD, useClass: PoliciesGuard },     // нет правила доступа → 403
]
```

**Правило:** у каждого обработчика контроллера есть `@CheckPolicies(...)`, `@Authenticated()` или `@Public()`. `@Authenticated()` — любой вошедший, без прав на объект: для действий человека только с собой (`GET /me`), объявляется так же явно. Отсутствие метаданных = отказ. Забытая проверка превращается из дыры в 403 при первом ручном прогоне.

**Тест метаданных** (обязательный, падает сборка): через `DiscoveryService` и `Reflector` обойти все контроллеры и все обработчики; каждый должен иметь `@CheckPolicies`, `@Authenticated` или `@Public` (`api/test/access-metadata.e2e-spec.ts`). Это аналог «сделать `roles` обязательным параметром».

### 4.3. Политики: CASL + `@casl/prisma`

Права объектного уровня (преподаватель видит только свои группы, родитель — только своих детей) описываются в одном файле, а выборки из БД фильтруются по ним автоматически.

```ts
// api/src/common/policies/abilities.ts (набросок, условия — синтаксис Prisma where)
import { AbilityBuilder } from "@casl/ability";
import { createPrismaAbility } from "@casl/prisma";

export function defineAbilityFor(user: SessionUser) {
  const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

  switch (user.role) {
    case "ADMIN":
      can("manage", "all");
      break;

    case "TEACHER":
      can("read", "Course", { teacherId: user.id });
      can("manage", "Group", { teacherId: user.id });
      can("manage", "Group", { course: { is: { teacherId: user.id } } });
      // ...
      break;

    case "STUDENT":
      can("read", "Lesson", {
        isPublished: true,
        course: { is: { enrollments: { some: { studentId: user.id } } } },
      });
      // ...
      break;

    case "PARENT":
      can("read", "User", { parentLinks: { some: { parentId: user.id } } });
      can("read", "AttendanceRecord", {
        student: { is: { parentLinks: { some: { parentId: user.id } } } },
      });
      // ...
      break;
  }

  return build();
}
```

Использование в сервисе:

```ts
import { accessibleBy } from "@casl/prisma";

const lessons = await this.prisma.lesson.findMany({
  where: { AND: [accessibleBy(ability).Lesson, { courseId }] },
});
```

**Почему это закрывает класс проблем 2.3 и 2.4:** выборка сама отфильтрована правами. Ручного `if (role === "STUDENT")` больше нет, значит нет и места, где его можно забыть, а роль PARENT не может «провалиться» в ветку персонала.

**Для каждой роли явно перечисляется, что разрешено.** Всё, что не перечислено, запрещено. Родителю — только дети из `ParentStudent` и их посещаемость/оценки/оплаты; правильные ответы тестов (`AssessmentAnswerOption.isCorrect`) — никому, кроме ADMIN/TEACHER своего курса.

Проверить на старте: какие операторы вложенных условий поддерживает установленная версия `@casl/prisma` (`is`, `some` и т.д.). Несколько `can` на одно действие объединяются через ИЛИ — это штатный способ, `OR` внутри условия не нужен.

### 4.4. CSRF

Server Actions в Next.js сами сверяют `Origin` с хостом. **При переходе на REST эта защита пропадает**, её нужно вернуть явно.

`OriginGuard` для небезопасных методов (POST, PUT, PATCH, DELETE):
- `Origin` есть — должен совпадать с `APP_URL`, иначе 403.
- `Origin` нет — допустимо только при заголовке `X-Internal-Token`, равном секрету из env (серверные вызовы из `web`), иначе 403.

Дополнительно: кука остаётся `SameSite=Lax` (дефолт Auth.js). CORS не нужен и не включается: `web` и `api` на одном домене.

**Вебхуки (этап 6).** Telegram и Eskiz шлют POST без `Origin` и без внутреннего токена — `OriginGuard` их отклонит. При переносе завести явный декоратор пропуска проверки `Origin` только для маршрутов, которые сами проверяют свой секрет.

### 4.5. Валидация

`nestjs-zod`: DTO создаются из существующих схем `src/validators/*.ts` (они зависят только от `zod`, проверено). Схемы переносятся в `api/src/modules/<модуль>/dto/` и начинают выполняться на сервере.

- Глобальный `ZodValidationPipe`.
- Лишние поля отбрасываются.
- Для строк задаются максимальные длины (сейчас их нет у имён, кода решений, комментариев — 4.7 аудита).
- `data.answers` и подобные массивы — с ограничением длины.

### 4.6. Ошибки

Единый формат ответа об ошибке через глобальный exception filter: `{ statusCode, error, message, details? }`. `message` — ключ перевода (как сейчас: `"forbidden"`, `"courseNotFound"`), а не текст — перевод делает `web`.

**Для объектов, недоступных по правам, возвращать 404, а не 403** — чтобы не подтверждать существование чужого id.

### 4.7. Очереди и rate limiting

**Redis не поднимаем** (решения владельца, раздел 0). Rate limiting — `@nestjs/throttler` с хранилищем в памяти процесса: инстанс `api` один, этого достаточно. Сейчас rate limiting на API в проде выключен (7.1 аудита): Upstash не настроен.

Очереди откладываются до этапа 6. Единственная нужная — `sms` (рассылки через Eskiz, сейчас синхронно в `src/actions/sms-actions.ts` `sendGroupBroadcast`). Кандидат — pg-boss поверх той же Postgres, без отдельного сервиса.

- `code-run` не нужна: Piston отключён.
- `billing-freeze` не нужна: ленивая заморозка в `src/lib/billing-ledger.ts` работает и проверена, переделывать её не цель переноса.

### 4.8. Файлы

- Загрузка стримится на диск, файл целиком в память не читается (сейчас `Buffer.from(await file.arrayBuffer())` при лимите видео 500 МБ и памяти контейнера 512 МБ — 4.1 аудита).
- MIME определяется по расширению на сервере по белому списку.
- Выдача: картинки — inline с правильным типом; всё остальное — `application/octet-stream` + `Content-Disposition: attachment; filename*=UTF-8''...`.
- Лимит видео снизить до реалистичного (~50 МБ).

### 4.9. Аудит

`AuditService` с тем же контрактом, что `src/lib/audit.ts`. Для денежных операций и окончательных удалений запись в журнал идёт **в той же транзакции**, что и изменение (как уже сделано в `src/lib/trash.ts`), а не «после, с проглатыванием ошибки».

---

## 5. Как web вызывает api

**Клиентские компоненты** — напрямую из браузера на `/api/v2/...`. Кука уходит автоматически.

**Серверные компоненты Next.js** — по внутренней сети на `http://api:4000/api/v2/...`, с пробросом куки и внутреннего токена:

```ts
// src/lib/api-client.ts (набросок)
import { cookies } from "next/headers";

export async function apiFetch(path: string, init: RequestInit = {}) {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${process.env.API_INTERNAL_URL}/api/v2${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...init.headers,
      cookie: cookieHeader,
      "x-internal-token": process.env.INTERNAL_TOKEN!,
    },
  });
}
```

**Типы.** `api` публикует OpenAPI через `@nestjs/swagger`; типы для `web` генерируются `openapi-typescript`. Руками типы ответов не пишутся.

**Правило ESLint в web:** `no-restricted-imports` для `@/generated/prisma` и `@/lib/prisma` в каждом перенесённом модуле; на этапе 9 — глобально.

### Ловушка: кэш Next.js перестанет инвалидироваться

Сейчас мутации вызывают `revalidateLocalized(...)` (`src/lib/revalidate.ts`) и `updateTag(MARKETING_TAG)` (`src/actions/marketing-content-actions.ts`). Когда мутация переезжает в `api`, Next.js об изменении не узнает.

- **Страницы кабинета** и так динамические (читают куки через `auth()`). Чтения через `apiFetch` идут с `cache: "no-store"`. Проблемы нет.
- **Лендинг** кэшируется по тегу. Нужен внутренний эндпоинт в `web`: `POST /api/internal/revalidate` с проверкой `X-Internal-Token`, который вызывает `updateTag`. `api` дёргает его после публикации маркетингового контента.

---

## 6. Порядок переноса

Перенос идёт модулями. **Модуль переезжает целиком**: все его actions, API-роуты и чистая логика. Порядок выбран так, чтобы первыми уходили модули с открытыми находками аудита, а биллинг, который работает правильно и покрыт проверками, — последним.

| Этап | Модуль api | Переносится из `src/actions/` | Переносится из `src/app/api/` | Закрывает находки |
|---|---|---|---|---|
| 1 | каркас | — | `health` | 1.4, 1.5 |
| 2 | `users` | `user-actions`, `telegram-actions` | — | 2.1, 2.8, 3.7, 1.3 |
| 3a | `courses` | `course-actions`, `course-copy-actions`, `course-compare-actions`, `enrollment-request-actions`, `admin-actions` | `enrollment-requests/count` | 2.3 |
| 3b | `groups` | `group-actions` | — | 2.3 |
| 3c | `attendance`, `parents` | `attendance-actions`, `parent-actions` | — | 2.3, 2.4, 2.5 |
| 4 | `lessons`, `assessments` | `lesson-actions`, `progress-actions`, `assessment-actions`, `import-actions` (тесты и экзамены) | `v1/progress`, `progress`, `v1/presence/ping`, `v1/export/exam`, `v1/export/test`, `export/*` | 2.4, 3.2–3.4, 2.6 (xlsx) |
| 5 | `homework`, `uploads` | `homework-actions`, `homework-review-actions`, `import-actions` (ДЗ) | `homework/[homeworkId]/upload`, `files/[fileId]`, `files/[fileId]/download`, `v1/export/homework`, `homework/count`, `v1/upload/image`, `v1/upload/video`, `upload/video`; роут `src/app/uploads/[...path]` | 3.4, 3.5, 3.6, 4.1 |
| 6 | `notifications` | `sms-actions`; бот `src/lib/telegram/*` | `sms/callback`, `telegram/webhook` | 2.7, 7.1 (rate limit) |
| 7 | `marketing` | `marketing-content-actions`, `lead-actions`, `site-settings-actions` | — | 2.11 |
| 8 | `billing` | `billing-actions`, `payment-actions` | `debtors/count` | — |
| 9 | вход и сессии | `auth-actions`, `email-verification-actions`, `telegram-auth-actions`; `src/lib/auth.ts` | `auth/[...nextauth]` | 2.1 целиком, 2.12 |
| 10 | перенос в `~/Projects/lms` | — | — | — |

Этап 3 разбит на три, потому что это самый крупный кусок интерфейса: его actions импортируются примерно в 44 местах. 2.2, 2.9, 3.1 и 7.1 (Piston) закрываются на этапе 0 и при переносе только сохраняются.

**Биллинг (этап 8) переносится не раньше, чем в проде проверена первая заморозка месяцев после 1 октября 2026.**

### Контракт ответа для интерфейса

Сейчас server actions импортируются в 94 файлах страниц и компонентов. Чтобы перенос модуля не превращался в переписывание компонентов, клиент `api` в `web` возвращает **тот же формат**, что и actions сейчас: `{ success: true, ... } | { success: false, error: "<ключ перевода>" }`. Тогда в компоненте меняется импорт, а обработка ошибок и переводы остаются.

### Этап 1 — каркас

- `api/` на NestJS, `setGlobalPrefix("api/v2")`, порт 4000.
- Второй генератор Prisma (раздел 3).
- `SessionGuard` с мостом к Auth.js (4.1), `PoliciesGuard` + CASL (4.2–4.3), `OriginGuard` (4.4), `ZodValidationPipe` (4.5), фильтр ошибок (4.6), `AuditService` (4.9).
- Тест метаданных (4.2) и инфраструктура e2e-тестов (раздел 7, Vitest + Testcontainers).
- `GET /api/v2/health`.
- `GET /api/v2/me` — доказательство, что мост к сессии работает на настоящей куке.
- Для локальной разработки rewrite `/api/v2/*` → `http://localhost:4000` в `next.config.ts` (Caddy локально нет). Починить локальную БД: порт 5433 в `docker-compose.yml` занят другим проектом.
- Сервис `api` в `docker-compose.prod.yml` (без Redis и Piston), маршрут в `Caddyfile` (раздел 8), CI (раздел 8).
- Существующие `scripts/check-*.ts` на этом этапе только запускаются в CI как есть. В тесты `api` они переносятся вместе со своим кодом: посещаемость — на этапе 3c, биллинг — на этапе 8.
- Ни одного перенесённого модуля — только проверка, что `api` поднимается в проде рядом с `web` и читает сессию.

**Готово, когда** в проде `GET /api/v2/me` под настоящей кукой отдаёт пользователя, а деактивированный пользователь получает 401 в пределах 30 секунд; замерено реальное потребление памяти `api`.

**Статус: закрыт 2026-09-18**, коммит `56dc9e3` в проде.

- В проде: `GET /api/v2/health` → 200 через Caddy; `GET /api/v2/me` под настоящей кукой владельца вернул его id и роль `ADMIN` из БД; без куки — 401 в едином формате; POST с чужого Origin отклонён. Контейнер `api` healthy, 48 МБ из лимита 200, на сервере занято 350 МБ из 956.
- CI: задача `test` (типы, линтер, `scripts/check-*`, 40 тестов `api`) — 2 мин 19 с, дальше два образа и деплой.
- Деактивация в пределах 30 секунд и «роль из БД, а не из токена» проверены тестами `api/test/session.e2e-spec.ts`; в проде на живых людях не проверялось намеренно.
- Образ `api` ~570 МБ, в работе ~45 МБ.

Отступления от текста выше, принятые при реализации:
- **NestJS 11, а не 12.** 12 вышла 2026-08-27, а `nestjs-zod` и `@nestjs/swagger` пока поддерживают только 10–11. Перейти, когда подтянутся.
- **Vitest вместо Jest** — см. раздел 7.
- **`@Authenticated()`** — третий вид правила доступа, см. 4.2.
- **Клиент Prisma — в `api/generated/prisma`, а не в `api/src/generated`**: `tsc` не копирует JS сгенерированного клиента в `dist`, а путь `../../../generated` одинаково верен из `src/` и из `dist/`.
- **`multer` поднят до 2.4.0 через `overrides`**: в 2.2.0 из `@nestjs/platform-express@11` — DoS (исправлено только в Nest 12).
- **Клиент `api` для `web` (`src/lib/api-client.ts`) и OpenAPI — на этапе 2**, вместе с первым модулем: на этапе 1 им нечего вызывать.
- **CI:** задача `test` перед сборкой (tsc и eslint для обоих приложений, `scripts/check-*`, тесты `api`), два образа, после деплоя — `caddy reload` (Caddyfile примонтирован файлом, `up` его не перечитывает) и проверка `/api/v2/health` через Caddy с сервера. `INTERNAL_TOKEN` деплой создаёт в `.env` сервера сам, один раз.
- **Образ `api` тяжелее, чем мог бы**: `prisma` и `typescript` — необязательные peer у `@prisma/client`, npm ставит их в прод-зависимости (~170 МБ). Отрезать средствами npm чисто не вышло; вернуться, если место на диске сервера станет проблемой.
- **HSTS без `includeSubDomains`**: осторожнее, и у `crm.best-direction.uz` поддоменов нет.
- Попутно: ошибка `react-hooks/rules-of-hooks` в `src/components/markdown-renderer.tsx` (аудит 4.5) — иначе `eslint` в CI красный; запасной пароль БД убран из `docker-compose.prod.yml` (аудит 2.13).

### Этап 10 — перенос в lms

После этапа 9. `~/Projects/lms` получает `api/` слиянием из best-direction по правилам из `CLAUDE.md` репозитория lms (брендинг, домены и деплой не переносятся). Прод lms деплоится вручную, его CI сломан — перед этапом решить, чинится ли CI.

### Этап 2 — users

**Статус: сделано 2026-09-18**, ветка `stage-2-users`.

- Перенесены `user-actions` и `telegram-actions` целиком; страница журнала аудита больше не ходит в базу. В `web` появился `src/lib/api/` — клиент с прежним контрактом ответа, разделённый на браузерную и серверную части (серверная тянет `next/headers`).
- Права: администратор — все, преподаватель — ученики и он сам, ученик и родитель — только он сам. Выборки фильтруются правилами через `accessibleBy`, чужой id отдаёт 404.
- Закрыты 2.1 (для api), 2.8, 3.7, 1.3 (в границах модуля).
- Схема БД всё-таки изменилась: добавлена таблица `TelegramLinkRequest`. Без неё 2.8 не закрыть — код привязки негде хранить. Миграция аддитивная.
- Проверки: 42 теста модуля (матрица ролей, чужой id, регрессии находок), проход по страницам кабинета под четырьмя ролями и проверка шагов бота на живой базе.
- Осталось на потом: `api` не публикует OpenAPI, типы ответов в `src/lib/api/users.ts` написаны руками.

### Этап 3a — courses (+ билинг целиком)

**Статус: сделано 2026-09-18**, ветка `stage-3a-courses`.

- Перенесены `course-actions`, `course-copy-actions`, `course-compare-actions`, `enrollment-request-actions`, `admin-actions`, а также `src/lib/trash.ts`. Разрешение адреса курса (slug → id) идёт через api; уроки и задания останутся на прямом запросе к базе до этапа 4.
- **Биллинг перенесён целиком вместо этапа 8** — решение владельца. Правка цены курса и группы обязана сначала заморозить закрытые месяцы, а расчёт жил в `web`: держать две копии денежной логики было бы опаснее, чем перенести её сразу. `billing-actions`, `payment-actions`, `src/lib/billing.ts` и `src/lib/billing-ledger.ts` уехали в api вместе с проверками: `check-billing.ts` стал 49 тестами расчёта, `check-billing-db.ts` — сценарием на настоящей базе. В `web` копия `src/lib/billing*.ts` живёт, пока её зовут группы (этап 3b).
- Права: администратор видит всё, преподаватель открывает любой курс, но правит только свои, ученик — опубликованные курсы, на которые записан. Деньги — только администратору.

**Найденная ловушка (важна для всех модулей).** Prisma считает пустой `OR` «ничем» только на верхнем уровне `where`; внутри `AND` он игнорируется, и выборка отдаёт все строки. То есть `where: { AND: [accessibleBy(...), ...] }` для роли без правил молча открывал всё. Поймано тестом (родитель увидел все курсы). Теперь условие строит `accessibleWhere` из `api/src/common/policies/abilities.ts`, который подставляет заведомо невыполнимое условие; пользоваться только им.

### Этап 3b — groups

**Статус: сделано 2026-09-18**, ветка `stage-3b-groups`.

- `group-actions` перенесён целиком; состав группы читает только персонал, менять может администратор и педагог своего курса.
- Все четыре точки заморозки закрытых месяцев сохранены: цена, даты и расписание группы, перевод ученика между группами, снятие группы с записи.
- Из `web` удалены `src/lib/billing.ts`, `src/lib/billing-ledger.ts`, `src/lib/trash.ts` и скрипты `check-billing*`: расчёт и его проверки живут в api с этапа 3a, второй копии денежной логики больше нет.
- 19 тестов модуля.

### Этап 3c — attendance, parents

**Статус: сделано 2026-09-18**, ветка `stage-3c-attendance`.

- `attendance-actions` и `parent-actions` перенесены целиком; `src/lib/attendance-access.ts` и `scripts/check-attendance-db.ts` уехали вместе с ними (12 проверок стали тестами).
- Закрыт остаток находки 2.4: родитель видит посещаемость только своих детей, ученик — только свою.
- Рассылки (`sms-actions`) пока в `web`, но получателей по группе берут из api — до этапа 6.
- 24 теста модулей.

### Этап 4 — lessons, assessments

**Статус: сделано 2026-09-18**, ветка `stage-4-lessons`.

- `lesson-actions`, `progress-actions`, `assessment-actions` и импорт тестов и экзаменов перенесены целиком; из `web` удалены `src/lib/assessment-scoring.ts`, `src/lib/spreadsheet-utils.ts`, `scripts/check-assessment-scoring.ts` и маршруты `v1/progress`, `progress`, `v1/presence/ping`, `v1/export/test`, `v1/export/exam`, `export/*`.
- Закрыты находки 3.2, 3.3, 3.4 (тесты; задания — этап 5), остаток 2.4 и 2.6 в части `xlsx`: пакет заменён на `@e965/xlsx` и живёт только в api.
- Прогресс просмотра принимается по POST: `navigator.sendBeacon` другого метода не умеет.
- Страницы уроков, тестов, экзаменов, «моих результатов» и страница курса читают данные из api. Прямое чтение осталось только там, где нужны задания: страница урока, её правка и публичный урок — они уедут на этапе 5 вместе с модулем `homework`.
- 291 тест в api (было 262).

**Решение владельца от 2026-09-18:** разбор ответов ученику не показывается вовсе — ни после первой попытки, ни после последней. Ученик видит баллы, процент и результат; правильные варианты остаются у преподавателя. До переноса разбор был открыт, и оставшиеся попытки сдавались по подсмотренным ключам.

### Этап 5 — homework, uploads

**Статус: сделано 2026-09-18**, ветка `stage-5-homework`.

- `homework-actions`, `homework-review-actions` и загрузка заданий из `import-actions` перенесены целиком; из `web` удалены маршруты `files/[fileId]`, `files/[fileId]/download`, `homework/[homeworkId]/upload`, `v1/export/homework`, `v1/upload/image`, `v1/upload/video`, `upload/video`.
- Закрыты находки 3.5, 3.6, 4.1 и остаток 3.4 (работы).
- Гостевые страницы урока и задания читают `@Public()`-маршруты `/public/lessons/...` и `/public/homework/...`: открыты только бесплатные курсы (2.9).
- Тома загрузок примонтированы и к `api` теми же путями, что у `app`: в базе у файлов работ лежит абсолютный путь, и он должен читаться из обоих контейнеров. Раздаёт публичные файлы по-прежнему `app` (`src/app/uploads/[...path]`).
- Панель запуска кода у преподавателя удалена: без Piston она всё равно не работала. Вернётся вместе с ним.
- `src/lib/homework-submission.ts` и `src/lib/submission-files.ts` остаются в `web` до этапа 6 — ими пользуется Telegram-бот. В боте добавлена обработка столкновения номера попытки.
- 23 теста модуля, всего в api 314.

### Этап 6 — notifications

**Статус: сделано 2026-09-18**, ветка `stage-6-notifications`.

- `sms-actions`, `src/lib/sms/eskiz.ts`, `notify.ts` и весь бот (`src/lib/telegram/bot.ts`, `notify.ts`, `messages.ts`) перенесены; маршруты `sms/callback` и `telegram/webhook` в web удалены.
- Закрыта находка 2.7: приём статусов доставки закрыт секретом в пути; секрет выводится из INTERNAL_TOKEN, отдельной переменной окружения не нужно.
- 7.1 (Upstash) закрыт для api: ограничение частоты даёт `ApiThrottlerGuard` в памяти процесса. В web остаётся форма заявок — этап 7.
- Бот заводит работы общим `SubmissionsService`: своей копии проверок срока и лимита попыток у него больше нет, а файл ложится в приватный том, а не в `public/uploads`. Ветка автопроверки кода убрана вместе с Piston.
- Новый декоратор `@Webhook()`: у входящих вебхуков нет заголовка Origin, и защита от CSRF отклоняла их (поймано тестом). Маршрут с ним обязан проверять запрос сам.
- Переключение вебхука сделано в два шага, чтобы бот не молчал: сначала деплой api с новым адресом, затем `setWebhook`, и только потом удаление бота из web.
- В `web` остались `src/lib/sms/phone.ts` и `templates.ts` — только для показа номеров и подсказки переменных в форме.
- 9 тестов модуля, всего в api 323.

### Этап 7 — marketing

**Статус: сделано 2026-09-19**, ветка `stage-7-marketing`.

- `marketing-content-actions`, `lead-actions`, `site-settings-actions` и чтение контента (`src/lib/marketing-content.ts`, `site-settings.ts`) перенесены; лендинг берёт всё одним публичным запросом `/marketing/landing`.
- Закрыта находка 2.11: разметка Editor.js чистится и при записи, и при выдаче.
- Закрыт остаток 7.1: поток заявок ограничен в api, а два оставшихся маршрута web переведены на счётчик в памяти процесса. `src/lib/rate-limit.ts` и `@upstash/*` удалены.
- Кэш лендинга остаётся в Next, но сбрасывает его api через `/api/internal/revalidate` с общим секретом. **Ловушка:** в обработчике маршрута работает только `revalidateTag(tag, "max")`; `updateTag` допустим лишь внутри серверного действия и падает с ошибкой.
- Первичное наполнение присылает web: статичные тексты и переводы остаются рядом с вёрсткой, пишет их api.
- 16 тестов модуля, всего в api 339.

### Этап 8 — сводка и адреса

**Статус: сделано 2026-09-20**, ветка `stage-8-dashboard`.

- Биллинг уехал раньше (этап 3a, решение владельца), поэтому от этапа остались сводка на главной и разрешение slug-адресов (`src/lib/slug-resolvers.ts`).
- Сводку считает api по роли вызывающего. Исправлены три неточности прежнего подсчёта: ученики преподавателя считаются по головам, курсы в Корзине исключены, «пройдено тестов» считает только завершённые попытки (с этапа 4 строка заводится при старте, и брошенная попытка засчитывалась как пройденная).
- Разрешение адресов идёт по правам: чужой курс, черновик урока и неопубликованное задание отдаются как несуществующие. Раньше slug превращался в id прямым запросом без проверок, а права смотрела уже страница.
- В `web` прямое чтение базы осталось только у входа (`auth-actions`, `email-verification-actions`, `telegram-auth-actions`, `src/lib/auth.ts`, `telegram/login.ts`), журнала аудита (`src/lib/audit.ts`) и `health` — всё это этап 9.
- 10 тестов модуля, всего в api 350.

### Этап 9 — вход и сессии

**Статус: сделано 2026-09-20**, ветка `stage-9-auth`. Три шага, чтобы никого не выбросить:

1. `105fc6b` — в api появились сессии в таблице `Session` (в базе хэш токена, кука `bd_session`, 30 дней) и вход: пароль, виджет Telegram, код из бота, регистрация, подтверждение почты, сброс пароля. Guard принимал обе куки — свою и прежнюю от NextAuth.
2. `870e5bf` — web переключился на api: страницы входа и восстановления, кнопка Telegram, выход; `auth()` заменён на `getSession()` (React `cache` + `/auth/me`).
3. `c78a6be` — NextAuth, Prisma, журнал аудита, письма и проверка подписи Telegram удалены из web; мост к прежней куке убран из api; миграции накатывает контейнер api; запрет импорта Prisma стал общим.

- Закрыты находки 2.1 (целиком) и 2.12.
- Окружение `app` сократилось до четырёх переменных: ни `DATABASE_URL`, ни секретов входа.
- 14 тестов входа плюс переписанные тесты сессии; всего в api 362.

**Ловушка:** тестовый помощник `sessionCookie` создавал куку Auth.js и использовался всеми e2e-тестами — вместе с мостом он переписан на настоящую строку сессии.

**Первый блок переноса закрыт.** В `web` осталось 13 файлов действий: уроки и тесты, домашние задания, импорт, прогресс, СМС, лендинг, заявки с сайта, настройки сайта и вход. После этапа 4 — 9: домашние задания, импорт заданий, СМС, лендинг, заявки с сайта, настройки сайта и вход.

### Этап 9 — вход и сессии переезжают в api

- Вход по паролю, через Telegram-виджет, через код Telegram-бота, регистрация, сброс пароля — в `api`.
- Сессии в БД (таблица сессий) с httpOnly-кукой; деактивация и сброс пароля удаляют все сессии пользователя.
- Ответ `requestPasswordReset` / `requestEmailVerification` одинаковый при существующем и несуществующем адресе (2.12).
- NextAuth удаляется из `web`, мост 4.1 удаляется из `api`.
- Владение миграциями переходит к `api`.
- Prisma удаляется из `package.json` `web`, правило ESLint из раздела 5 становится глобальным.

### Страницы и библиотеки, которые ходят в Prisma напрямую

Удаления actions недостаточно. Часть страниц читает БД сама, в обход actions, и тоже переходит на `apiFetch`. Список получен командой `grep -rl 'from "@/lib/prisma"' src/app src/components src/lib`.

| Этап | Файлы |
|---|---|
| 2 | `src/app/[locale]/(dashboard)/audit/page.tsx` |
| 3 | `src/app/[locale]/(dashboard)/courses/[courseSlug]/page.tsx`; `src/lib/slug-resolvers.ts` (разрешение slug → id используется почти всеми страницами курса — в `api` отдельный эндпоинт); `src/lib/trash.ts` |
| 4 | **сделано:** `.../lessons/[lessonSlug]/test/page.tsx`, `.../lessons/[lessonSlug]/test/attempts/page.tsx`, `.../exams/*` (все пять), `.../my-results/page.tsx`, `.../courses/[courseSlug]/page.tsx`. **Перенесено на этап 5** (нужны задания): `.../lessons/[lessonSlug]/page.tsx`, `.../lessons/[lessonSlug]/edit/page.tsx`, публичная `src/app/[locale]/(public)/lessons/open/[courseSlug]/[lessonSlug]/page.tsx` (в `api` — эндпоинт с `@Public()`) |
| 5 | **сделано:** обе публичные страницы (урока и задания), страница урока и её правка, все страницы `homework/*`. `src/lib/homework-submission.ts` остаётся в `web` до этапа 6 — он нужен Telegram-боту |
| 6 | `src/lib/sms/eskiz.ts`, `src/lib/sms/notify.ts`, `src/lib/telegram/bot.ts` |
| 7 | `src/app/[locale]/(dashboard)/admin/landing/page.tsx`, `.../admin/landing/pages/page.tsx`, `.../admin/landing/pages/[id]/page.tsx`; `src/lib/marketing-content.ts`; `src/lib/site-settings.ts` (логотип читает layout кабинета — после переноса каждая страница кабинета зависит от `api`) |
| 8 | `src/app/[locale]/(dashboard)/dashboard/page.tsx` (сводка по нескольким модулям — переносится последней из страниц); `src/lib/billing-ledger.ts` |
| 9 | `src/lib/telegram/login.ts`; `src/lib/audit.ts` (копия в `web` живёт, пока хоть одна мутация остаётся в `web`) |

Публичные страницы уроков и ДЗ сейчас проверяют только `isPublished` и не смотрят на `Course.accessType` (2.9). При переносе в `api` решить с владельцем, открыты ли уроки платных курсов, и закрепить решение в правилах `@Public()`-эндпоинта.

### Чистая логика переезжает без изменений

Проверено: эти файлы не зависят от Next.js.

| Файл | Зависимости | Куда |
|---|---|---|
| `src/lib/billing.ts` | нет | `api/src/modules/billing/domain/` |
| `src/lib/billing-ledger.ts` | только Prisma | `api/src/modules/billing/` |
| `src/lib/attendance-access.ts` | нет | `api/src/modules/attendance/domain/` (на этапе 3 заменяется правилами CASL, функции остаются как проверка) |
| `src/lib/date-only.ts` | нет | `api/src/common/` |
| `src/lib/homework-submission.ts` | Prisma, code-runner | `api/src/modules/homework/` (прогон тестов уходит в очередь `code-run`) |
| `src/validators/*.ts` | только `zod` | DTO соответствующих модулей |

### Критерии готовности этапа

Этап закрыт, когда выполнено всё:

- [ ] Все перечисленные в таблице actions удалены из `src/actions/`, `web` их не импортирует.
- [ ] Все перечисленные API-роуты удалены из `src/app/api/`.
- [ ] Страницы и библиотеки этапа из таблицы «ходят в Prisma напрямую» больше не импортируют `@/lib/prisma`.
- [ ] Тест метаданных зелёный: у каждого обработчика есть `@CheckPolicies`, `@Authenticated` или `@Public`.
- [ ] e2e-тест матрицы ролей модуля зелёный (раздел 7).
- [ ] e2e-тест «чужой id → 404» зелёный.
- [ ] Указанные находки аудита закрыты; в `AUDIT-2026-09-17.md` (копия в best-direction) у них проставлена отметка «закрыто на этапе N».
- [ ] Деплой прошёл, smoke-проверка после деплоя зелёная, ручная проверка ключевых экранов модуля в проде под ролями ADMIN, TEACHER, STUDENT, PARENT.

---

## 7. Тесты

**Инструменты:** Vitest (с SWC ради метаданных декораторов), Supertest, Testcontainers с `postgres:16-alpine`. Миграции накатываются на контейнер перед прогоном (`api/test/global-setup.ts`).

Не Jest, хотя он стандарт NestJS: `@auth/core` распространяется только как ESM, и Jest без пересборки чужих пакетов его не загружает. У NestJS есть официальный рецепт под Vitest.

**Существующие проверки переносятся первыми.** `scripts/check-billing.ts`, `scripts/check-billing-db.ts`, `scripts/check-attendance-db.ts` превращаются в тесты `api`. Они уже работают против одноразовой БД — формат совместим.

**Обязательные тесты для каждого модуля:**

1. **Матрица ролей.** Таблица «маршрут × роль → ожидаемый статус» для ADMIN, TEACHER (свой курс), TEACHER (чужой курс), STUDENT (записан), STUDENT (не записан), PARENT (свой ребёнок), PARENT (чужой ребёнок), аноним.
2. **Чужой id.** Для каждого маршрута с id в пути: запрос от пользователя без доступа к объекту → 404.
3. **Регрессии аудита.** Для каждой закрытой находки — тест, воспроизводящий исходную атаку. Например для 3.1: отправка одного правильного ответа десять раз не повышает процент.

**В CI тесты гоняются перед сборкой образа.** Красные тесты — деплоя нет.

---

## 8. Инфраструктура и деплой

### Память сервера

**VPS не увеличиваем** (решения владельца, раздел 0). Лимиты в compose складываются в 896 МБ из 956, но реально занято намного меньше. Замер 2026-09-17:

| Контейнер | Занято | Лимит |
|---|---|---|
| `app` | 189 МБ | 512 МБ |
| `db` | 36 МБ | 256 МБ |
| `caddy` | 33 МБ | 128 МБ |

Свободно 594 МБ, swap 2 ГБ. `api` (NestJS + Prisma, ожидаемо 120–180 МБ) получает `mem_limit: 200m`. Redis и Piston не поднимаются. После деплоя этапа 1 замерить `docker stats` и `free -m`; если `available` падает ниже ~150 МБ или swap начинает активно расти — пересмотреть лимиты (`web` по мере переноса логики можно ужимать).

### docker-compose.prod.yml

Сервис Next.js в compose называется `app`; в этом документе он везде `web`.

Добавить сервис `api` с явным `environment:` со всеми переменными (`DATABASE_URL`, `AUTH_SECRET`, `INTERNAL_TOKEN`, `APP_URL`, `TELEGRAM_*`, `ESKIZ_*`, `RESEND_API_KEY`, `EMAIL_FROM`). Docker Compose **не пробрасывает** переменные из `.env` в контейнер сам — только перечисленные в `environment:`; именно так в проде потерялись Piston и Upstash.

У `web` добавить `API_INTERNAL_URL=http://api:4000` и `INTERNAL_TOKEN`.

Убрать фолбэк пароля БД: `${DB_PASSWORD:?нужен DB_PASSWORD}` (2.13).

### Caddyfile

```caddy
{$APP_DOMAIN} {
	encode zstd gzip

	handle /api/v2/* {
		reverse_proxy api:4000
	}

	handle {
		reverse_proxy app:3000
	}

	header Strict-Transport-Security "max-age=31536000"
}
```

### CI (`.github/workflows/deploy.yml`)

- Задача `test` перед `build`: `tsc --noEmit` и `eslint` для `web` и `api`, тесты `api`. `build` зависит от `test`.
- Два образа: `web` и `api`, оба с тегом коммита.
- `concurrency: { group: deploy-production, cancel-in-progress: false }` — сделано на этапе 0.
- Бэкап перед `docker compose up -d` на сервере — сделано на этапе 0 (бэкапы хранятся на том же сервере, ротация 14 дней).
- Smoke-проверка после деплоя дополняется запросом `GET /api/v2/health`.

---

## 9. Известные ловушки текущего кода

**Soft-delete через расширение Prisma.** `src/lib/prisma.ts`: обычный клиент дописывает `deletedAt: null` во все поиски `User`, `Course`, `Lesson` и превращает `delete` в простановку `deletedAt`. Корзина, окончательное удаление и проверки уникальности (email, slug, telegramChatId держат значение и у удалённых) обязаны использовать клиент без фильтра (`prismaUnscoped`). В `api` сохранить оба клиента в `PrismaService` с такими же именами и таким же поведением — иначе сломаются корзина и регистрация.

**Даты.** `src/lib/date-only.ts` и `toNoonUtc` в `payment-actions.ts`: календарные даты хранятся полднем UTC, месяцы — строками `"YYYY-MM"`, потому что Date-поля срезаются на день назад в часовых поясах впереди UTC. При переносе не «упрощать» это до `new Date(...)`.

**Двойной прогон proxy в Next 16.** `src/proxy.ts:37-73` — Next прогоняет proxy повторно на внутреннем rewrite, из-за этого был бесконечный редирект. `/api/v2/*` до `web` не доходит (Caddy), так что proxy его не касается — но не добавлять в proxy логику, которая переписывает `/api/*`.

**Лендинг на отдельном домене.** Запросы к `MARKETING_DOMAIN` переписываются на `/marketing/<locale>/...` по заголовку Host (`src/proxy.ts:80`). Маршрут `/api/v2/*` в Caddy добавляется **только** в блок `APP_DOMAIN`.

**Telegram webhook.** `src/app/api/telegram/webhook/route.ts:22-32`: при ошибке обработчика отвечать 200, иначе Telegram бесконечно повторяет апдейт и очередь бота встаёт. В `api` сохранить это поведение. grammy подключается через `webhookCallback(bot, "express")`.

**SMS callback.** Отвечать 200 и на ошибку (`src/app/api/sms/callback/route.ts:37,57`) — иначе Eskiz повторяет доставку бесконечно. При переносе добавить секрет в путь (2.7).

**Биллинг проверен на настоящей БД.** После любого изменения в модуле `billing` гонять перенесённые тесты из `scripts/check-billing-db.ts`. Первая заморозка месяцев в проде — 1 октября 2026 года.

---

## 10. Определение готовности всего переноса

- [ ] `src/actions/` пуст и удалён.
- [ ] В `web` нет Prisma и NextAuth: `grep -rl '@/lib/prisma\|@/generated/prisma' src/` пуст.
- [ ] Все маршруты `api` под тестом метаданных, матрицей ролей и тестом чужого id.
- [ ] Все находки разделов 2 и 3 аудита закрыты либо явно отложены с причиной.
- [ ] CI не деплоит без зелёных тестов, деплои не идут параллельно, перед миграцией снимается бэкап.
- [ ] Rate limiting работает в проде и это проверено запросом, а не конфигом.
- [ ] Задания типа CODE недоступны, пока Piston отключён (или Piston поднят отдельным решением владельца).
- [ ] Этап 10: `api/` перенесён в lms.
