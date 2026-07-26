# Куда внедрять центральный кэш (@lib/app-cache)

Инвентаризация ad-hoc кэшей по монорепе (все сейчас — сырой `RedisService` +
строковые ключи, теряются при перезагрузке Redis). Помечено, что мигрировать
в первую очередь, что позже, а что кэшем не является и мигрировать не надо.

## ✅ Уже на AppCache

| Модуль | Файл | app / group |
|---|---|---|
| kpi-report-sales / sales-finance | `apps/kpi-report-sales/src/sales-finance/cache/sales-finance-cache.service.ts` | `sales-finance:v2` / closed, hot |
| kpi-report-sales / share-link (снимки публичных ссылок) | `apps/kpi-report-sales/src/share-link/services/share-link-snapshot.service.ts` | `kpi-share` / snapshot |
| kpi-report-sales / airtime (месячные ячейки «сотрудник × месяц», getMany/setMany) | `apps/kpi-report-sales/src/airtime/cache/airtime-cache.service.ts` (+ README модуля) | `airtime` / month |

## 🎯 Приоритет 1 — прямые кандидаты (тяжёлые данные, обидно терять при рестарте Redis)

1. **bx-department: структура отделов** — `libs/bx-department/services/bx-department-structure.service.ts`
   Ключи `department_structure_v2_{domain}_{day}_{group}_{mode}`. Тяжёлый батч в Bitrix;
   используется kpi-report-sales и event-sales. → `app: 'bx-department', group: 'structure'`.
   Вместе с ним:
   - `bx-department.service.ts` (`department_{domain}_…`) → group `department`
   - `bx-team.service.ts` (`bx_team_{domain}_…`) → group `team`
   - `bx-department-cache.service.ts` (инвалидация SCAN-паттернами) → `appCache.reset({app:'bx-department', domain})` — код сильно упростится.

2. **portal-lib: снапшот портала** — `libs/portal-lib/portal/src/portal.service.ts`
   `portal_{domain}`, TTL ~10ч. Самый горячий кэш монорепы (каждый pbx.init).
   → `app: 'portal', key: 'snapshot'`. Инвалидация `portal-online-cache.service.ts` → `delete()`.
   ⚠️ Аккуратно: это hot-path всех приложений — мигрировать отдельным PR с прогоном всех аппов.

3. **kpi-report-sales / user-report** — `apps/kpi-report-sales/src/user-report/` (результаты async-джоб user-report)
   → `app: 'kpi-user-report'`, TTL как сейчас. Заодно уберётся прямой RedisModule из модуля.

4. **call-lib: аналитика отчётов по звонкам** — `libs/call-lib/src/call-report-analytics/services/call-report-analytics-cache.service.ts`
   `{prefix}:{kind}:{domain}:{sha256(params)}`, TTL из env. Дорогие LLM/BD-выборки → БД-фолбэк очень кстати.
   → `app: 'call-report-analytics', group: kind`.

5. **pbx: generic-кэш сущностей** — `apps/pbx/src/pbx-cache/pbx-cache.service.ts`
   `pbx-cache:{domain}:{entity}` — по сути самодельный аналог AppCache. Заменить целиком адаптером
   (как sales-finance) или прямым вызовом. → `app: 'pbx', group: entity`.

## 🕐 Приоритет 2 — можно позже

6. **event-service: категории smart-актов** — `apps/event-service/src/smart-act/services/smart/category-smart-act.service.ts` → `app: 'event-service', group: 'smart-act'`.
7. **call-lib: Yandex IAM-токен** — `libs/call-lib/.../yandex/yandex-auth.service.ts` — короткоживущий токен; выгода в инспекции (видно, когда протухает).
8. **event-sales: состояние cron-сканера call-report** — `apps/event-sales/src/call-report/cron/call-report.scheduler.ts` — маленький стейт, но станет виден в инспекции.

## 🚫 НЕ мигрировать (не кэш, а рабочее состояние с семантикой Redis)

- **Bull-очереди** (`libs/queue`) — своя Redis-инфраструктура.
- **marketplace: токены/локи** — `libs/marketplace-core/src/refresh/marketplace-token.service.ts` — лок через `SET … PX NX` (атомарность Redis), в БД дублировать нельзя; сами install-данные и так в MySQL.
- **marketplace-сессии/инвайты** (`apps/pbx/src/marketplace/services/…`) — короткоживущие сессии onboarding, дублирование в БД лишнее.
- **konstructor: эфемерные PDF/операции** (`apps/konstructor/src/offer-word/…`, `zakupki-offer`) — бинарники/операционный стейт, философия «файлы не храним».
- **bitrix rate-limiter** (`libs/bitrix/src/core/rate-limit/…`) — счётчики с атомарными INCR, только Redis.
- **transcription flow-DTO storage** (`libs/call-lib/.../flow-dto-storage.service.ts`) — стейт конвейера очереди, живёт вместе с джобами.

## Как мигрировать (рецепт)

1. В модуль ничего добавлять не надо (AppCacheService — @Global через root).
2. Существующий cache-сервис превратить в адаптер: парсишь свой старый ключ на
   `{app, domain, key, group}` и делегируешь `get/set/reset` (пример —
   `sales-finance-cache.service.ts`). Call-sites не трогаются.
3. `resetByPattern`/SCAN-инвалидация → `appCache.reset({app, domain, keyPrefix})`.
4. Старые Redis-ключи не чистить — протухнут по TTL.
5. Проверка: `POST /app-cache/list {app: '<твой app>'}` — записи видны, `inRedis: true`.
