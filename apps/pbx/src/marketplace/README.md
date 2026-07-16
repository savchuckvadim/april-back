# Модуль `marketplace` — «Менеджер Гарант» в Битрикс24.Маркет

> Полное описание модуля установки/жизни тиражного маркетплейс-приложения.
> Актуально на 2026-07-16. Живой прогон на портале april-dev пройден целиком
> (установка → кабинет → виджеты).
>
> Смежные документы:
> [план публикации](../../../../ai/tasks/bitrix-marketplace-publication-plan.md) ·
> [flow установки](../../../../ai/tasks/bitrix-marketplace-install-flow.md) ·
> [карта URL](../../../../ai/marketplace/URLS_AND_PAGES.md) ·
> [реестр карточки](../../../../ai/marketplace/APP_PUBLICATION_DATA.md) ·
> [БД](../../../../ai/tasks/bitrix-marketplace-db-changes.md) ·
> [онбординг](../../../../ai/tasks/bitrix-marketplace-client-onboarding.md) ·
> [auth-обзор](../../../../docs/AUTH.md) ·
> [чистка легаси](../../../../ai/tasks/bitrix-marketplace-legacy-cleanup-task.md)

## 1. Роль модуля

Единственный владелец маркетплейс-мира: установка приложения, открытия
(приложение/виджеты), события жизненного цикла, сессии кабинета, онбординг
клиентов, admin-операции вендора. Публичный контракт —
`https://api.pbx.april-app.ru/api/bitrix-marketplace/*` (эти URL зарегистрированы
в карточке вендора и в `placement.bind` — они СТАБИЛЬНЫ, фронты за ними
подменяемы).

Легаси-мир (`Client → User → Portal → bitrix_apps → bitrix_tokens`,
`apps/back/bitrix-app-client`) не используется и не тронут: маркетплейс живёт
в своих таблицах `marketplace_installs`, `portal_products`,
`marketplace_install_components`, `bitrix_app_events` + переиспользует
`portals` (идентичность по `member_id`) и `bitrix_app_secrets`.

## 2. Структура

```
config/marketplace-manifest.ts     ЭТАЛОН: виджеты × места встройки × frontUrl,
                                   lifecycle-события; регламент изменения — в шапке файла
lib/parse-install-params.util.ts   Парсер запросов Битрикса (body+query, оба канала)
lib/bitrix-request-logger.middleware.ts  Сквозной лог BitrixInbound (вход/выход)
lib/mask-payload.util.ts           Маскирование токенов для журнала/логов
lib/install-finish-page.util.ts    HTML-финал установки (same-origin, BX24.installFinish)
lib/admin-key.guard.ts             Guard admin-ручек (X-Admin-Key)
lib/portal-session.guard.ts        Guard portal-context сессии (Bearer, role=CLIENT)
clients/marketplace-bx.client.ts   Тонкий REST-клиент Битрикса (stateless; TODO → libs/bitrix)
persistence/marketplace-install.repository.ts  Всё хранение (Prisma; токены шифруются)
services/
  marketplace-install.service.ts        Пайплайн установки (5 шагов, state machine)
  marketplace-router.service.ts         Открытия: токены + сессия + redirect на фронты
  marketplace-session.service.ts        Гейт+сессия: верификация, JWT, one-time code
  marketplace-onboarding.service.ts     Заявка клиента (организация+email) + уведомление
  marketplace-lifecycle.service.ts      ONAPPUNINSTALL/UPDATE/PAYMENT (guard по app-token)
  marketplace-event-sync.service.ts     diff-синхронизация event.bind с эталоном
  marketplace-placement-sync.service.ts diff-синхронизация placement.bind с эталоном
  marketplace-admin.service.ts          Диагностика установок, refresh привязок
controllers/  install | router | session | onboarding | event | admin
```

## 3. Эндпоинты (все принимают POST и GET/HEAD — Битрикс шлёт данные и в body, и в query)

| Endpoint | Назначение |
|---|---|
| `POST/GET /install` | Установка (ONAPPINSTALL callback + iframe мастера). Пайплайн: [1] портал (member_id-first, fallback domain, дозаполнение legacy) + `marketplace_installs` (токены шифруются crypt.util/APP_KEY) → [2] event.bind-синхронизация → [3] placement.bind-синхронизация → [4] умные сценарии (ставит сам Битрикс из архива карточки; компоненты skipped/bitrix_archive) → [5] pbx-сущности (ЗАГЛУШКА pending/stub) → `installed`. Iframe получает **HTML-финал с этого же origin** (redirect на чужой origin ломает installFinish — родитель Битрикса отвечает только зарегистрированному origin; доказано живым тестом 2026-07-14). Пустой GET/HEAD → 200 (валидатор кабинета) |
| `POST/GET /app` | Основное приложение: свежие токены сохраняются (бесплатный refresh) → верификация (member_id + application_token + REST `profile`) → 302 на кабинет `?domain&lang&status&state&code` (state: onboarding/pending/active/blocked/unauthorized; сырой member_id НЕ передаётся) |
| `POST/GET /placement/:code` | Виджеты (коды — закрытый enum из эталона): токены → 302 на `frontUrl` виджета (свой домен; подмена env `MARKETPLACE_WIDGET_URL_<КОД>` без деплоя) + `placement_options` |
| `POST /session/exchange` | Обмен одноразового кода (Redis, TTL 60с, сжигается) на `{token, state, domain, memberId, user}`; token = portal-context JWT |
| `GET /onboarding/state`, `POST /onboarding` | Состояние допуска / подача заявки (организация+email). ТОЛЬКО под PortalSessionGuard (Bearer). Заявка идемпотентна, уведомляет вендора (Telegram + журнал) |
| `POST /event` | ONAPPUNINSTALL (soft-delete) / ONAPPUPDATE (новый scope/version/application_token) / ONAPPPAYMENT (журнал). Guard: сверка `auth[application_token]` с сохранённым |
| `POST/GET /hook/list/:code` | Хуки универсальных списков (приёмник-заглушка) |
| `GET /admin/installs`, `POST /admin/placements/refresh` | Диагностика/раскатка эталона привязок. Guard `X-Admin-Key` (env `MARKETPLACE_ADMIN_KEY`; пусто = выключено) |

## 4. Статусные оси (не смешивать)

| Ось | Где | Значения |
|---|---|---|
| Техустановка | `marketplace_installs.install_status` | pending → tokens_stored → events_bound → placements_bound → installed \| error(+error_step) |
| Допуск портала вендором | `portals.approval_status` | pending → approved \| blocked; NULL = legacy = допущен |
| Аккаунт клиента | `clients.status` | pending → confirmed → disabled |
| Оплата/продукты | `portal_products.status` | inactive/trial/active/expired (пока не используется кодом) |
| Компоненты | `marketplace_install_components.status` | pending/installing/installed/error/unavailable/skipped (+reason_code) |

## 5. Сессия кабинета (Bearer-only, без cookies)

Пользователь в iframe аутентифицирован фактом установки — логин не нужен.
Каждое открытие `/app`: верификация → portal-context JWT (канон `AuthUser`
из centralized-auth: `role=CLIENT`, `sub=member_id`, `portalId`, `clientId?`;
подпись `AuthTokenService` из `@lib/auth.forIssuer()`, общий `AUTH_JWT_SECRET`
→ SSO) → в redirect уходит только одноразовый `code` → фронт меняет его на
токен (`/session/exchange`) и держит **в памяти**, отправляя Bearer-ом.
Cookies не используются вовсе → нет проблем SameSite/CHIPS/ITP в iframe.

## 6. Выполнено (со ссылками на задачи)

- ✅ Полный install-флоу MVP (живой портал) — [mvp-install-task](../../../../ai/tasks/bitrix-marketplace-mvp-install-task.md)
- ✅ Эталон-манифест виджет×места + diff-синхронизация привязок и событий + admin-refresh
- ✅ HTML-финал установки same-origin (installFinish) + сквозной лог BitrixInbound
- ✅ Гейт + сессия (этап 1 [онбординга](../../../../ai/tasks/bitrix-marketplace-client-onboarding.md)) + `AuthModule.forIssuer()` (шаг 1 [centralized-auth](../../../../docs/tasks/centralized-auth.md))
- ✅ Заявка клиента (этап 2 онбординга): Client + link по member_id + Telegram вендору

## 7. Осталось (следующие этапы)

- Фронт этапа 1–2 онбординга: экраны onboarding/pending/blocked + exchange-клиент — [онбординг](../../../../ai/tasks/bitrix-marketplace-client-onboarding.md)
- Этап 3 онбординга: approve/block в `apps/admin` + revoke + письмо клиенту
- Рефреш токенов через `oauth.bitrix24.tech` (этап 4 [плана](../../../../ai/tasks/bitrix-marketplace-publication-plan.md)) — сейчас токены живут час и обновляются открытиями
- LicenseService: `app.info` + обработка ONAPPPAYMENT (этап 7 плана)
- Provisioning pbx-сущностей через очередь (заглушка `pbx_entities`)
- Типизированные домены `libs/bitrix` вместо MarketplaceBxClient (этап 3 плана)
- Материалы модерации + архив умных сценариев — [реестр](../../../../ai/marketplace/APP_PUBLICATION_DATA.md)
- Чистка легаси по условиям — [cleanup](../../../../ai/tasks/bitrix-marketplace-legacy-cleanup-task.md)

## 8. Env (все — `.env.example`)

`MARKETPLACE_API_PUBLIC_URL` (HANDLER'ы bind), `MARKETPLACE_APP_REDIRECT_URL`
(кабинет), `MARKETPLACE_INSTALL_REDIRECT_URL` (запасной), `MARKETPLACE_WIDGET_URL_<КОД>`
(подмена фронта виджета), `MARKETPLACE_ADMIN_KEY` (admin-ручки),
`AUTH_JWT_SECRET` (подпись сессий; фолбэк `APP_SECRET_KEY`), `APP_KEY`
(шифрование токенов — ЕДИНЫЙ с apps/back!), Redis, `TELEGRAM_*` (уведомления).
