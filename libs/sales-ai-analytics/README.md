# @lib/sales-ai-analytics

Модель AI-аналитики отдела продаж (план `ai/tasks/ai-sales-analytics-plan.md`):
чистые детерминированные функции без DI, Bitrix и БД. Хост-приложение —
`apps/kpi-report-sales` (feature-модуль `ai-analytics`), источник строк —
`CallReportAnalyticsDataService.loadLite` из `@lib/call-lib`.

## Состав

| Файл | Что даёт |
|---|---|
| `model/thresholds.const.ts` | `AI_ANALYTICS_THRESHOLDS` — пороги n, σ XmR, длина серии, z90, короткий звонок |
| `model/wilson.ts` | `wilsonInterval(successes, n, z?)` — интервал доли |
| `model/metric.ts` | `MetricValue`, `confidenceFor`, `rateMetric`, `scoreMetric`, `METRIC_CONFIDENCE_REASONS` |
| `model/xmr.ts` | `xmrLimits(points)` — центр, `±2,66·MR̄`, состояние последней точки |
| `model/workdays.util.ts` | `WorkCalendar`, `parseWorkCalendar`, `toPortalDate`, `isWorkday`, `lastWorkdays`, `previousWorkday` |
| `model/pulse.ts` | `computePulse(rows, options)` — доля «шаг с датой» за окно рабочих дней + XmR по дням |
| `model/agenda.ts` | `buildAgenda(rows)` — 3 звонка РОПу: риск-флаги → спорные возражения → худший раздел |
| `model/morning-digest.ts` | `buildMorningDigest(rows, managerId)` — фразы `alternatives` менеджеру |
| `contracts/versions.types.ts` | `AnalysisVersions`, `comparableFrom` |
| `contracts/feedback.types.ts` | `AI_ANALYTICS_FEEDBACK_TYPE`, `AI_ANALYTICS_FEEDBACK_KINDS`, payload записи `ais` |
| `contracts/snapshot.types.ts` | `SkillSnapshot` (Фаза 2) |

`SalesAiAnalyticsModule` — пустая обёртка под будущие провайдеры.

## Тесты

```bash
npx jest libs/sales-ai-analytics
```

## Аудит данных (Фаза 0)

Каталог `src/audit` — чистая логика аудита данных, на которых строится аналитика: покрытие менеджера по месяцам, разборы по ячейкам менеджер × тип × месяц, шум типов, длительности, версии разбора, заполненность полей, глубина ais и рекомендация по порогам. Единый текст «что делает и как читать» — `AI_ANALYTICS_AUDIT_ABOUT` (`audit/ai-analytics-audit.about.ts`): он же уходит в Swagger, README и в поле `about` ответа ручки.

Nest-слой (`src/admin`):

- `SalesAiAnalyticsAuditModule` — сервисный, без контроллеров: `AiAnalyticsAuditService` (расчёт по живой БД через Prisma, снапшот в ais, проверка признака портала) и `AiAnalyticsAuditSnapshotStore`. Импортируется в kpi-report-sales (месячный снапшот по крону).
- `SalesAiAnalyticsAdminModule` — контроллер `admin/ai-analytics/*`, подключается ТОЛЬКО в apps/admin (JWT + роль SUPER_USER).

| Ручка | Что делает |
|---|---|
| `POST admin/ai-analytics/audit` `{domain, months?, timeZone?, save?}` | считает аудит по живой БД, при `save` пишет снапшот (ais type `ai-analytics-audit`, source admin); 403 без признака портала |
| `GET admin/ai-analytics/audit/latest?domain=` | последний снапшот (ручка или крон), 404 если нет |
| `GET admin/ai-analytics/audit/about?domain=` | самоописание + признак `ai_analytics_audit_enabled` и дата последнего снапшота портала |

Признак портала — ключ `ai_analytics_audit_enabled` приложения kpi-sales (настройки портала в админке); он не зависит от `ai_analytics_enabled`, аудит делается до включения витрины. Крон — 1-го числа 04:10 МСК (`AiAnalyticsAuditScheduler` в kpi-report-sales). CLI на сервере: `npm run audit:ai-analytics -- --domain <домен> [--months 6]`.

Пример вызова с локальной машины (токен суперпользователя из логина админки):

```bash
curl -X POST "$ADMIN_API/api/admin/ai-analytics/audit" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"domain":"april.bitrix24.ru","months":6}'
```
