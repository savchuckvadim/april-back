# Модуль `marketplace` — «Менеджер Гарант» в Битрикс24.Маркет

> Полное описание модуля установки/жизни тиражного маркетплейс-приложения.
> Актуально на 2026-07-18. Живой прогон на портале april-dev пройден целиком
> (установка → кабинет → виджеты → переустановка → ONAPPUNINSTALL).
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
lib/widget-stub-page.util.ts       HTML-заглушка виджета «Приложение пока не готово»
lib/admin-key.guard.ts             Guard admin-ручек (X-Admin-Key)
lib/portal-session.guard.ts        Guard portal-context сессии (Bearer, role=CLIENT)
clients/marketplace-bx.client.ts   Тонкий REST-клиент Битрикса (stateless; TODO → libs/bitrix)
persistence/marketplace-install.repository.ts  Всё хранение (Prisma; токены шифруются;
                                   компонент-статусы делегируются @lib/marketplace-core)
services/
  marketplace-install.service.ts        Пайплайн установки (5 шагов, state machine)
  marketplace-router.service.ts         Открытия: токены + сессия + redirect на фронты
                                        + readiness-гейт виджетов (заглушка «не готово»)
  marketplace-session.service.ts        Гейт+сессия: верификация, JWT, one-time code
  marketplace-onboarding.service.ts     Заявка клиента (организация+email) + уведомление
  marketplace-cabinet.service.ts        Сводка кабинета: продукты + статусы компонентов
  marketplace-product.service.ts        Активация продукта (approve) + dispatch provisioning
  marketplace-lifecycle.service.ts      ONAPPUNINSTALL/UPDATE/PAYMENT (guard по app-token)
  marketplace-event-sync.service.ts     diff-синхронизация event.bind с эталоном
  marketplace-placement-sync.service.ts diff-синхронизация placement.bind с эталоном
  marketplace-admin.service.ts          Диагностика установок, refresh привязок
controllers/  install | router | session | onboarding | cabinet | event | admin
```

Смежные части маркетплейс-мира вне модуля:

- **`@lib/marketplace-core`** — общая либа pbx ↔ pbx-install: рефреш токенов
  через oauth.bitrix24.tech (`MarketplaceTokenService`, Redis-lock, типизированные
  ошибки — «портал спал >28 дней» отличим от сбоя), доступ к учёткам установок,
  общий репозиторий статусов компонентов, контракт очереди provisioning.
- **`libs/pbx` PBXService.init(domain)** — marketplace-first: при активной
  установке в `marketplace_installs` авторизация OAuth-токеном (авто-refresh)
  вместо вебхука/online-API; legacy-путь не тронут; предохранитель
  `PBX_MARKETPLACE_AUTH_FIRST=false`.
- **`apps/pbx-install/src/modules/marketplace-provision`** — воркер очереди
  `marketplace-provision` (BullMQ): по манифесту `SALES_PROVISION_STEPS`
  устанавливает pbx-сущности sales существующими use-case'ами, ведёт
  по-шаговые статусы `pbx_entities` и агрегат (component_code='') — ключ
  готовности для роутера. RPA — skipped/tariff_restricted (запрещены тарифом).
- **`apps/admin/src/marketplace-moderation`** — модерация заявок
  (@Roles(SUPER_USER)): список, approve (клиент active + HTTP на pbx
  `admin/products/activate`) / block, статусы компонентов. Требует
  AUTH_ENABLED=true в env admin.

## 3. Эндпоинты (все принимают POST и GET/HEAD — Битрикс шлёт данные и в body, и в query)

| Endpoint | Назначение |
|---|---|
| `POST/GET /install` | Установка (ONAPPINSTALL callback + iframe мастера). Пайплайн: [1] портал (member_id-first, fallback domain, дозаполнение legacy) + `marketplace_installs` (токены шифруются crypt.util/APP_KEY) → [2] event.bind-синхронизация → [3] placement.bind-синхронизация → [4] умные сценарии (ставит сам Битрикс из архива карточки; компоненты skipped/bitrix_archive) → [5] агрегат pbx-сущностей pending/awaiting_approval (при переустановке на портале с активным sales — НЕ сбрасывается) → `installed`. Iframe получает **HTML-финал с этого же origin** (redirect на чужой origin ломает installFinish — родитель Битрикса отвечает только зарегистрированному origin; доказано живым тестом 2026-07-14). Пустой GET/HEAD → 200 (валидатор кабинета) |
| `POST/GET /app` | Основное приложение: свежие токены сохраняются (бесплатный refresh) → верификация (member_id + application_token + REST `profile`) → 302 на кабинет `?domain&lang&status&state&code` (state: onboarding/pending/active/blocked/unauthorized; сырой member_id НЕ передаётся). На state=onboarding в сессию кладётся email из `user.current` (префилл формы) |
| `POST/GET /placement/:code` | Виджеты (коды — закрытый enum из эталона): токены → **readiness-гейт** (агрегат pbx_entities продукта installed? легаси-порталы пропускаются) → 302 на `frontUrl` виджета (подмена env `MARKETPLACE_WIDGET_URL_<КОД>` без деплоя) + `placement_options`; не готов/blocked/удалён → same-origin HTML-заглушка (200) |
| `POST /session/exchange` | Обмен одноразового кода (Redis, TTL 60с, сжигается) на `{token, state, domain, memberId, user}`; token = portal-context JWT |
| `GET /onboarding/state`, `POST /onboarding` | Состояние допуска / подача заявки (организация+email). ТОЛЬКО под PortalSessionGuard (Bearer). Заявка идемпотентна, уведомляет вендора (Telegram + журнал) |
| `GET /cabinet/summary` | Сводка кабинета: продукты portal_products + статусы компонентов (PortalSessionGuard) |
| `POST /event` | ONAPPUNINSTALL (soft-delete) / ONAPPUPDATE (новый scope/version/application_token) / ONAPPPAYMENT (журнал). Guard: сверка `auth[application_token]` с сохранённым |
| `POST/GET /hook/list/:code` | Хуки универсальных списков (приёмник-заглушка) |
| `GET /admin/installs`, `POST /admin/placements/refresh` | Диагностика/раскатка эталона привязок. Guard `X-Admin-Key` (env `MARKETPLACE_ADMIN_KEY`; пусто = выключено). refresh теперь сам освежает access_token (MarketplaceTokenService) |
| `POST /admin/products/activate`, `POST /admin/provision/refresh` | Активация продукта (approve: допуск + portal_products + dispatch provisioning-джоба; идемпотентно, стабильный jobId) / повторный запуск provisioning. Guard `X-Admin-Key`; дергает apps/admin при approve заявки |

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
- ✅ (2026-07-18) Рефреш токенов через `oauth.bitrix24.tech` — `@lib/marketplace-core`
- ✅ (2026-07-18) Provisioning pbx-сущностей sales: очередь `marketplace-provision` + воркер в pbx-install + marketplace-OAuth-путь в `PBXService.init`
- ✅ (2026-07-18) Этап 3 онбординга: `apps/admin/marketplace-moderation` (approve = активация sales + запуск provisioning; block)
- ✅ (2026-07-18) Readiness-гейт виджетов: заглушка «Приложение пока не готово» до установки сущностей
- ✅ (2026-07-18) Кабинет с данными: `GET /cabinet/summary` + фронт (продукты, статусы компонентов) + префилл email заявки из `user.current`
- ✅ (2026-07-18) Admin-обзор в apps/admin: `GET admin/marketplace/installs[/:id]`, `GET admin/marketplace/events` (журнал, пагинация), `GET admin/marketplace/portals/:id/products`, прокси-действия `POST portals/:id/provision-refresh|placements-refresh` (X-Admin-Key живёт server-side)
- ✅ (2026-07-18) Админ-фронт (front/apps/admin): раздел «Marketplace» — Заявки (approve/block/re-provision/refresh-виджетов, продукты, компоненты), Установки, Клиенты, Секреты приложений (CRUD, секрет маскирован), Журнал событий; легаси «app на клиента» (entities/bitrix-app, entities/bitrix, get-app.helper, @workspace/nest-api) удалено

## 7. Осталось (следующие этапы)

- Живые тесты нового флоу на april-dev: онбординг-форма (сбросить портал в pending) → approve через админку → provisioning → готовые виджеты; повторный прогон (идемпотентность field/category-цепочек)
- ~~Страница логина админ-фронта~~ ✅ 2026-07-18: /auth/login (Bearer-везде,
  токен в cookie фронт-домена → Authorization-заголовок во все 3 api-пакета,
  SSO по общему AUTH_JWT_SECRET), logout в шапке. Общий auth проекта
  (клиент в pbx-install/konstructor, web-кабинет, refresh) — отдельное
  обсуждение: повестка в docs/AUTH.md §5
- Состав `SALES_PROVISION_STEPS` — подтвердить с владельцем (departament/konstructor-исключения помечены TODO в манифесте)
- Включить AUTH_ENABLED=true в env admin (иначе @Roles не защищает модерацию); env: MARKETPLACE_CLIENT_ID/SECRET (pbx + pbx-install), PBX_API_URL+MARKETPLACE_ADMIN_KEY (admin), TELEGRAM_* (pbx/admin)
- Письмо клиенту об одобрении (сейчас Telegram вендору + журнал; MailModule в admin не подключён сознательно — тянет Bull-процессор почты)
- LicenseService: `app.info` + обработка ONAPPPAYMENT (этап 7 плана)
- Типизированные домены `libs/bitrix` вместо MarketplaceBxClient (этап 3 плана)
- Материалы модерации: сузить scope карточки (сейчас ≈все скоупы!), архив умных сценариев, скриншоты — [реестр](../../../../ai/marketplace/APP_PUBLICATION_DATA.md)
- Чистка легаси по условиям — [cleanup](../../../../ai/tasks/bitrix-marketplace-legacy-cleanup-task.md)

## 8. Env (все — `.env.example`)

`MARKETPLACE_API_PUBLIC_URL` (HANDLER'ы bind), `MARKETPLACE_APP_REDIRECT_URL`
(кабинет), `MARKETPLACE_INSTALL_REDIRECT_URL` (запасной), `MARKETPLACE_WIDGET_URL_<КОД>`
(подмена фронта виджета), `MARKETPLACE_ADMIN_KEY` (admin-ручки),
OAuth-креды приложения — в БД `bitrix_app_secrets` (code=garant_manager;
CRUD в админке `PUT /api/admin/bitrix-app-secrets/garant_manager`, секрет в
ответах маскируется; подхват без рестарта — кэш 1 мин), env
`MARKETPLACE_CLIENT_ID`/`MARKETPLACE_CLIENT_SECRET` — фолбэк,
`PBX_MARKETPLACE_AUTH_FIRST` (предохранитель OAuth-детекта в
PBXService, default on), `PBX_API_URL` (admin → pbx активация),
`AUTH_JWT_SECRET` (подпись сессий; фолбэк `APP_SECRET_KEY`), `APP_KEY`
(шифрование токенов — ЕДИНЫЙ у pbx/pbx-install/back!), Redis (сессии, локи,
BullMQ), `TELEGRAM_*` (уведомления).
