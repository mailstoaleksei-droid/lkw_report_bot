# Деплой GROO Fleet Portal на Railway

## Архитектура

```
[Браузер]
    │ HTTPS
    ▼
[Railway: web] ── /api/* rewrites ──▶ [Railway: api] ── DATABASE_URL ──▶ [Neon PostgreSQL]
  Next.js                               Fastify
  порт: $PORT (авто)                    порт: 4000 (фиксированный)
```

Браузер никогда не обращается к API напрямую. Все `/api/*` запросы проксируются через Next.js. Куки работают в рамках одного домена.

---

## Шаги деплоя

### 1. Создать Railway проект

1. Открыть [railway.app](https://railway.app) → New Project
2. Выбрать "Deploy from GitHub repo"
3. Подключить репозиторий `mailstoaleksei-droid/lkw_report_bot`

### 2. Создать сервис API

В Railway проекте: **Add Service → GitHub Repo** (тот же репозиторий)

**Settings → Build:**
- Root Directory: `planning_app`
- Config File Path: `apps/api/railway.json`

**Settings → Deploy:**
- Railway автоматически читает Dockerfile из `apps/api/railway.json`

**Variables (обязательные):**
```
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://<web-сервис>.up.railway.app
JWT_SECRET=<минимум 32 символа случайной строки>
SESSION_COOKIE_NAME=lkw_planning_session
SESSION_COOKIE_SECURE=true
DATABASE_URL=<neon-postgres-url>?schema=planning
DIRECT_URL=<neon-postgres-url>?schema=planning
IMPORT_STAGING_DIR=/tmp/imports
EXPORT_OUTPUT_DIR=/tmp/exports
BACKUP_DIR=/tmp/backups
```

> `DATABASE_URL` и `DIRECT_URL` — строки подключения из Neon Dashboard (Settings → Connection String).
> Формат: `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require&schema=planning`

**Сгенерировать JWT_SECRET** (PowerShell):
```powershell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

### 3. Создать сервис Web

В Railway проекте: **Add Service → GitHub Repo** (тот же репозиторий, второй раз)

**Settings → Build:**
- Root Directory: `planning_app`
- Config File Path: `apps/web/railway.json`

**Variables:**
```
NODE_ENV=production
NEXT_PUBLIC_API_BASE_URL=
API_INTERNAL_URL=http://api.railway.internal:4000
```

> `NEXT_PUBLIC_API_BASE_URL=` — пустая строка. В браузере все запросы идут на относительный путь `/api/*`.
> `API_INTERNAL_URL` — URL API сервиса через Railway Private Networking (внутренняя сеть).

### 4. Настроить приватную сеть Railway

В настройках API сервиса: **Networking → Private Networking → Enable**

Убедиться что имя сервиса (Service Name) — `api`. Это формирует внутренний DNS `api.railway.internal`.

Если имя другое, обновить `API_INTERNAL_URL` в web сервисе соответственно.

### 5. Обновить CORS_ORIGIN

После того как web сервис задеплоен и получил публичный URL:

В API сервисе → Variables:
```
CORS_ORIGIN=https://<ваш-web-домен>.up.railway.app
```

Если настроен custom domain: `https://fleet.groo.de` (например).

### 6. Первый деплой

Railway автоматически:
1. Собирает Docker образы
2. При старте API контейнера запускается `prisma migrate deploy` (миграции)
3. Запускает API на порту 4000
4. Запускает Web, который проксирует API запросы

### 7. Проверить работу

- `https://<web>.up.railway.app/` — должна открыться страница логина
- `https://<web>.up.railway.app/api/healthz` — должно вернуть `{ "ok": true }`

---

## Переменные окружения — итоговая таблица

| Переменная | Сервис | Значение |
|---|---|---|
| `NODE_ENV` | api + web | `production` |
| `PORT` | api | `4000` |
| `DATABASE_URL` | api | Neon connection string с `?schema=planning` |
| `DIRECT_URL` | api | То же что DATABASE_URL |
| `JWT_SECRET` | api | Случайная строка 32+ символов |
| `SESSION_COOKIE_NAME` | api | `lkw_planning_session` |
| `SESSION_COOKIE_SECURE` | api | `true` |
| `CORS_ORIGIN` | api | URL web сервиса (https://...) |
| `IMPORT_STAGING_DIR` | api | `/tmp/imports` |
| `EXPORT_OUTPUT_DIR` | api | `/tmp/exports` |
| `BACKUP_DIR` | api | `/tmp/backups` |
| `NEXT_PUBLIC_API_BASE_URL` | web | *(пусто)* |
| `API_INTERNAL_URL` | web | `http://api.railway.internal:4000` |

---

## Обновление после изменений кода

Railway автоматически передеплоивает при push в `main` ветку.

Для ручного деплоя: Railway Dashboard → сервис → Deploy.

## Миграции БД

Миграции запускаются автоматически при каждом старте API контейнера (`prisma migrate deploy`).
Это безопасно — команда идемпотентна и применяет только новые миграции.

## Дополнительно

- **Custom domain**: Railway Settings → Networking → Custom Domain
- **Мониторинг**: Railway метрики + Uptime Robot (бесплатный) для внешнего пинга
- **Логи**: Railway Dashboard → сервис → Deployments → View Logs
