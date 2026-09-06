# ai-analytics — AI-аналитика отдела продаж (Фаза 1a)

Feature-модуль `apps/kpi-report-sales/src/ai-analytics/` по плану
`ai/tasks/ai-sales-analytics-plan.md` (разделы 6.2–6.5, 4.11, 9 «Фаза 1a»).
Тег Swagger — **Sales AI Analytics**, префикс роутов — `ai-analytics`.

## Ручки (все POST, тело содержит `domain` и `requesterUserId`)

| Ручка | Кэш | Права | Ответ |
|---|---|---|---|
| `ai-analytics/settings/get` | 300 с на домен | все | `AiAnalyticsSettingsDto`: флаги, `pipelineEnabled` (разборы за 30 дней), `readiness`, `callTypes[]` из `AI_ANALYTICS_EVENT_KINDS`, `comparableFrom`, `ropUserIds` |
| `ai-analytics/pulse` | 1 ч на домен, ключ по `endDate` | периметр | `AiPulseDto`: окно 5 рабочих дней до вчерашнего рабочего дня, XmR, `byManager` (n ≥ 20), `alerts` |
| `ai-analytics/agenda` | до следующего понедельника | периметр | `AiAgendaDto`: 3 звонка ISO-недели, `link` на карточку смарта, `disagreements` |
| `ai-analytics/feedback` | — | менеджер только за себя | запись в `ais` (контракт 4) |
| `ai-analytics/feedback/list` | — | по всем — только руководители | `items` + `disagreementSharePct` |
| `ai-analytics/cache/reset` | — | только `cup`/`op` | `{deletedCount, pattern}` |
| `ai-analytics/push` | — | руководители | ручной запуск рассылки: `kind: agenda|digest`, `date?` (день запуска, TZ портала), `recipients?` (тест «отправить себе») → `AiPushResultDto {kind, date, status: sent|skipped|failed, reason, delivered[]}` |

Конверт ответа: `{status: 'ready'|'queued'|'processing'|'error', requestKey, data?, message?}`.

## Права (6.5)

`domain/access/requester-access.service.ts` берёт `currentUser.visibility` из
`BxDepartmentStructureService.getStructure(domain, sales, userId)`:
`all → cup` (видит всех), `department → op`, `group → group`, `own → manager`
(только себя). Периметр кэшируется на 5 мин (`access:{userId}`), ошибка
структуры — fail-closed (только себя). Результаты pulse/agenda считаются на
весь домен и кэшируются один раз; периметр применяется presenter'ом при отдаче
(`perimeter.util.ts`). Строки без менеджера видны только тем, кто видит всех.

## Состав

```
ai-analytics.module.ts / ai-analytics.controller.ts
constants/ai-analytics.const.ts        — тег, префикс, TTL, WS-события, роли, as const-справочники
cache/cache-key.util.ts                — ключи sales-ai-analytics:v1:{domain}:{section}:…, TTL повестки
cache/ai-analytics-cache.service.ts    — адаптер AppCache (как sales-finance)
dto/*                                  — запросы/ответы, русские описания
domain/access/*                        — RequesterAccessService, perimeter.util
domain/loaders/*                       — settings (kpiSales), calls (loadLite call-lib), smart-link, period.util (TZ)
domain/presenter/*                     — pulse.presenter, pulse-alerts.util, readiness.util, smart-link.util
domain/use-cases/*                     — settings, pulse, agenda, morning-digest, feedback,
                                         push (фасад) + push-agenda / push-digest, push.types
store/ai-analytics-feedback.store.ts   — ais-записи type = ai-analytics-feedback
store/ai-analytics-push-log.store.ts   — журнал доставки (agenda_sent / digest_sent) поверх feedback.store
delivery/ai-analytics-delivery.service.ts — non-injectable транспорт new Svc(bitrix): im.notify.system.add
delivery/ai-analytics-message.util.ts  — чистые тексты повестки и дайджеста (BB-код)
cron/ai-analytics-push.scheduler.ts    — крон: пн 08:30 МСК повестка, ежедневно 08:00 МСК дайджест
queue/ai-analytics.processor.ts        — воркер JobNames.SALES_AI_ANALYTICS_PUSH (очередь SALES_KPI_REPORT)
__tests__/*                            — юнит-тесты + DI-граф модуля
```

## Push-контур (шаг 2)

Поток: `AiAnalyticsPushScheduler` (крон в UTC: `30 5 * * 1` и `0 5 * * *`) →
`PortalAppSettingsService.listByAppCode(kpiSales)` → по каждому домену
`SettingsLoader.load` (нужен `ai_analytics_enabled`; для дайджеста — ещё
`ai_analytics_digest_enabled`; для повестки — непустой `ai_analytics_rop_user_ids`)
→ `QueueDispatcherService.dispatch(SALES_KPI_REPORT, SALES_AI_ANALYTICS_PUSH,
{domain, kind, date}, jobId)` с `jobId = ai-analytics:push:{kind}:{domain}:{date}`
(дедуп повторного тика за день; `date` — день в TZ портала) →
`AiAnalyticsQueueProcessor` → `AiAnalyticsPushUseCase.execute` (тот же код, что
у ручки `ai-analytics/push`; ошибка — warn + rethrow, `attempts: 1`).

| Вид | Кейс | Получатели | Текст | Идемпотентность |
|---|---|---|---|---|
| `agenda` | `PushAgendaUseCase` | РОПы из настроек | `buildAgendaMessage`: 3 звонка недели — менеджер («Фамилия Имя» через `user.get`, fail-open `#id`), тип звонка, причина, цитата (≤ 300 симв.), ссылка на карточку разбора; пункт «Несогласия недели» | одна запись `agenda_sent` (`object = agenda:{weekKey}`) на домен+неделю, ищется с понедельника недели |
| `digest` | `PushDigestUseCase` | каждый менеджер (bitrix-id = `managerId`) | `buildDigestMessage`: «Вчерашние звонки: что сказать иначе» — до 3 звонков с худшим разделом, «было» и до 3 дословных фраз `alternatives`, ссылка | одна запись `digest_sent` (`object = digest:{day}`, `managerId`) на домен+менеджер+день; в выходной (календарь портала) не шлётся |

Записи доставки — те же ais-записи контракта 4 (`AiAnalyticsPushLogStore` над
`AiAnalyticsFeedbackStore`), `payload` — доставленные и `transcriptionIds`.
Уведомления — `bitrix.imNotify.systemAdd` с `TAG` (`ai-analytics:agenda:{weekKey}`,
`ai-analytics:digest:{day}:{managerId}`): сбой одного получателя не мешает остальным;
никому не доставлено → `status: failed`, отметка не пишется.

Ручной запуск `POST ai-analytics/push` (руководители): `date` — «как если бы крон
сработал в этот день» (момент расчёта — полдень дня в TZ портала), `recipients` —
тест «отправить себе»: повестка уходит им вместо РОПов, дайджест каждого менеджера —
им с подписью «Менеджер: …»; флаг дайджеста, выходные и отметки `*_sent` при этом
не применяются и не пишутся.

Источник данных — `CallReportAnalyticsDataService.loadLite` (`@lib/call-lib`,
без текста транскрипта); модель — чистые функции `@lib/sales-ai-analytics`
(`computePulse`, `buildAgenda`, `buildMorningDigest`, календарь рабочих дней).

Ссылка на разбор: `https://{domain}/crm/type/{entityTypeId}/details/{itemId}/`
— `entityTypeId` из `PbxAicallSmartService.resolveInfo`, `itemId` —
`report_item_id` ais-записи `agent-analysis` звонка (как в weekly-report).

## Аудит данных (Фаза 0)

Месячный снапшот аудита: `cron/ai-analytics-audit.scheduler.ts` 1-го числа 04:10 МСК ставит джобу `SALES_AI_ANALYTICS_SNAPSHOT` (kind audit, jobId по домену и месяцу) по порталам с признаком `ai_analytics_audit_enabled`; `domain/use-cases/audit-snapshot.use-case.ts` считает отчёт через `AiAnalyticsAuditService` из `@lib/sales-ai-analytics` и пишет снапшот в ais (source cron). Ручки аудита живут в apps/admin (`SalesAiAnalyticsAdminModule`), здесь их нет. CLI: `audit/run-ai-analytics-audit.ts` (`npm run audit:ai-analytics`). Самоописание аудита и признак портала — в ответе `settings/get` (`auditEnabled`) и в `GET admin/ai-analytics/audit/about`.

## Дальше (Фаза 1b)

`overview` / `attention` / `by-type` / `settings/save` (план, 6.2): очередь + WS
`AI_ANALYTICS_WS_EVENTS`, кэш `overview` по периоду. Экспорт из `index.ts`:
`AiAnalyticsModule`, `AiAnalyticsCacheService`, `PulseUseCase`, `AgendaUseCase`,
`MorningDigestUseCase`, `AiAnalyticsFeedbackStore`, `AiAnalyticsPushUseCase`,
`AiAnalyticsDeliveryService`, `AiAnalyticsPushLogStore`, `buildPushJobId`.

## Проверка

```
npx eslint --fix "apps/kpi-report-sales/src/ai-analytics/**/*.ts"
npx jest apps/kpi-report-sales/src/ai-analytics
npx tsc -p tsconfig.json --noEmit
npm run test:di
```
