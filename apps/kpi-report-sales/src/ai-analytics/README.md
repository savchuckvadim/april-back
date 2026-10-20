# ai-analytics — AI-аналитика отдела продаж (Фазы 1a–4)

Feature-модуль `apps/kpi-report-sales/src/ai-analytics/` по плану
`ai/tasks/ai-sales-analytics-plan.md` (разделы 6.2–6.5, 4.11, 9 «Фаза 1a»).
Тег Swagger — **Sales AI Analytics**, префикс роутов — `ai-analytics`.

## Ручки (все POST, тело содержит `domain` и `requesterUserId`)

Подпись запроса (21.09.2026, вопрос владельцу A3): мутирующие ручки —
`settings/save`, `feedback`, `cache/reset`, `push`, `rop-mark/save`,
`plan/daily`, `brief`, `manager/style` — помечены `@PortalSessionProtected()`
из `@lib/auth`: фронт обменивает AUTH_ID фрейма на JWT ручкой
`POST auth/portal-session` и шлёт его `Authorization: Bearer`; guard сверяет
`domain` и `requesterUserId` тела с сессией. Режим
`PORTAL_SESSION_GUARD_MODE` (off | report | enforce, по умолчанию report —
нарушения только в лог) — см. `libs/auth/README.md`.

| Ручка | Кэш | Права | Ответ |
|---|---|---|---|
| `ai-analytics/settings/get` | 300 с на домен | все | `AiAnalyticsSettingsDto`: флаги, `pipelineEnabled` (разборы за 30 дней), `readiness`, `callTypes[]` из `AI_ANALYTICS_EVENT_KINDS`, `comparableFrom`, `ropUserIds`; настройки 07.09.2026 — `selfViewEnabled`, `dailyPlanEnabled`, `digestAllUserIds: string[]`, `poolOptIn`, `poolConsentAt: string \| null`, `experimentsEnabled`; `analysisSince?: string \| null` (30.09.2026) — день самого раннего готового разбора портала в его TZ (`TranscriptionStoreService.findFirstDoneAt`): период раньше — «разбор ещё не шёл»; null — разборов нет, поля нет — не прочитано |
| `ai-analytics/pulse` | 1 ч на домен, ключ по `endDate` | периметр; менеджер — только при `self_view` | `AiPulseDto`: окно 5 рабочих дней до вчерашнего рабочего дня, XmR, `byManager` (строка сотрудника — с `managerMinN` разборов за окно: код реестра `pulse_manager_min_n`, портал переопределяет в `ai_analytics_model_params`, по умолчанию 8), `managerMinN` и `minDurationSec` (порог «короткого» звонка портала для подписи доли коротких), `alerts` (каждый — с `link` на карточку разбора в смарте, null — элемента нет) |
| `ai-analytics/agenda` | до 15 минут (и не дольше, чем до следующего понедельника); новое несогласие сбрасывает | периметр; менеджер — только при `self_view` | `AiAgendaDto`: 3 звонка прошлой полной ISO-недели, `link` на карточку смарта, `disagreements` |
| `ai-analytics/feedback` | — | менеджер только за себя; `alert_handled` — только руководители | запись в `ais` (контракт 4); `useful`/`not_useful` — одна оценка на автора, объект и день портала (смена оценки переводит прежнюю в `superseded`) |
| `ai-analytics/review` | — | открытая (с сайта продукта, без сессии фрейма): ссылка на карточку разбора сверяется со смартом портала, лимит 10 отправок за 10 минут с адреса | отзыв руководителя на разбор → запись `ai-analytics-feedback` (useful / disagree, object `site-review:{itemId}`, детали в payload) + сообщение в чат; `AiReviewResultDto` |
| `ai-analytics/feedback/list` | — | по всем — только руководители и в их периметре (записи без менеджера — только `cup`); менеджер — только при `self_view` | `items` (без служебных `alert_sent`/`digest_sent`/`agenda_sent`/`rop_mark`) + `disagreementSharePct` |
| `ai-analytics/cache/reset` | — | только `cup`/`op` | `{deletedCount, pattern}` |
| `ai-analytics/push` | — | руководители | ручной запуск рассылки: `kind: agenda|digest|digest_all`, `date?` (день запуска, TZ портала), `recipients?` (тест «отправить себе») → `AiPushResultDto {kind, date, status: sent|skipped|failed, reason, delivered[]}` |

Конверт ответа: `{status: 'ready'|'queued'|'processing'|'error', requestKey, data?, message?}`.

## Права (6.5)

`domain/access/requester-access.service.ts` берёт `currentUser.visibility` из
`BxDepartmentStructureService.getStructure(domain, sales, userId)`:
`all → cup` (видит всех), `department → op`, `group → group`, `own → manager`
(только себя). Периметр кэшируется на 5 мин (`access:{userId}`), ошибка
структуры — fail-closed (только себя). Результаты pulse/agenda считаются на
весь домен и кэшируются один раз; периметр применяется presenter'ом при отдаче
(`perimeter.util.ts`). Строки без менеджера видны только тем, кто видит всех.

**Витрина только руководителям** (решение владельца 07.09.2026, план §14.5
п. 4; ключ `ai_analytics_self_view_enabled`, default false). Читающие ручки
(`pulse`, `agenda`, `overview`, `attention`, `by-type`, `feedback/list`) берут
периметр через `RequesterAccessService.resolveViewer`: роль `manager` (нет
`headOf`; суперпользователь и принудительная видимость дают `cup`) при
выключенной настройке → 403 `ForbiddenException` с текстом
`AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE` («Витрина AI-аналитики доступна
руководителям; включите ai_analytics_self_view_enabled, чтобы менеджеры видели
свои данные»); при включённой — прежнее «только свои строки». `settings/get`
доступна всем (фронту нужны флаги, чтобы скрыть `AI_TAB`), `feedback` (запись)
не ограничивается, push-контур менеджеру (дайджест) от настройки не зависит.
Настройка читается только для роли `manager` (руководителям — лишнего запроса нет).

**Настройки 07.09.2026** (`[kpiSales]` в
`libs/portal-lib/store/app-settings/portal-app-settings.schema.ts`, читает
`SettingsLoader`, отдаёт `settings/get`; `settings/save` их не пишет — Фаза 2):
`ai_analytics_self_view_enabled` (см. выше), `ai_analytics_daily_plan_enabled`
(план дня в дайджесте и ручка `plan/daily`, Фаза 2),
`ai_analytics_digest_all_user_ids` (CSV адресатов сводного дайджеста, в DTO —
`digestAllUserIds: string[]`), `ai_analytics_pool_opt_in` +
`ai_analytics_pool_consent_at` (согласие на пул; дата ISO, пусто → `null`),
`ai_analytics_experiments_enabled`. Все дефолты — выключено/пусто.

## Состав

```
ai-analytics.module.ts                 — сборка фичи: ядро, конвейер registerPhase2(), срезы ручек
ai-analytics.controller.ts             — Фаза 1a; ai-analytics-overview.controller.ts — Фаза 1b;
                                         ai-analytics-plan / -brief / -rop-mark.controller.ts, style/ai-analytics-style.controller.ts,
                                         about/ai-analytics-about.controller.ts — Фаза 2
core/                                  — ядро общих провайдеров (без Битрикса) и его PBX-половина
pipeline/, steps/                      — ночной конвейер: раннер, журнал, порядок 11 шагов, сами шаги
snapshots/, passport/, stage-history/, rop-mark/, portal-model/, plan/, brief/, style/, about/ — модули срезов
about/                                 — блок «Как считаем»: тексты по ручкам (const), билдер из реестра + снапшота модели, ручка `about`
constants/ai-analytics.const.ts        — тег, префикс, TTL, WS-события, роли, as const-справочники
cache/cache-key.util.ts                — ключи sales-ai-analytics:v1:{domain}:{section}:…, TTL повестки
cache/ai-analytics-cache.service.ts    — адаптер AppCache (как sales-finance)
dto/*                                  — запросы/ответы, русские описания
domain/access/*                        — RequesterAccessService, perimeter.util
domain/loaders/*                       — settings (kpiSales), calls (loadLite call-lib), smart-link, period.util (TZ)
domain/presenter/*                     — pulse.presenter, pulse-alerts.util, readiness.util, smart-link.util
domain/use-cases/*                     — settings, pulse, agenda, morning-digest, feedback,
                                         push (фасад) + push-agenda / push-digest / push-digest-all, push.types
store/ai-analytics-feedback.store.ts   — ais-записи type = ai-analytics-feedback
store/ai-analytics-push-log.store.ts   — журнал доставки (agenda_sent / digest_sent, object digest:… | digest_all:…) поверх feedback.store
delivery/ai-analytics-delivery.service.ts — non-injectable транспорт new Svc(bitrix): im.notify.system.add
delivery/ai-analytics-message.util.ts  — чистые тексты повестки и дайджеста (BB-код)
delivery/ai-analytics-digest-all-message.util.ts — группировка ростера по отделам и текст сводного дайджеста
cron/ai-analytics-push.scheduler.ts    — крон: пн 08:30 повестка, ежедневно 08:00 дайджест + сводный дайджест — по часовому поясу портала (ai_analytics_calendar), тик ежечасный; push-slot.rules.ts — когда слот пропускается и о чём предупредить
queue/ai-analytics.processor.ts        — воркер очереди SALES_KPI_REPORT: PUSH, SNAPSHOT (аудит и ритмы конвейера), OVERVIEW, BRIEF
__tests__/*                            — юнит-тесты + DI-граф сборки и срезов
```

## Push-контур (шаг 2)

Поток: `AiAnalyticsPushScheduler` (тики ежечасные: `30 * * * *` повестка и `0 * * * *` дайджесты; слот — 08:30 по понедельникам и 08:00 ежедневно по часовому поясу портала из `ai_analytics_calendar`, по умолчанию Europe/Moscow) →
`PortalAppSettingsService.listByAppCode(kpiSales)` → по каждому домену
`SettingsLoader.load` (нужен `ai_analytics_enabled`; для дайджеста — ещё
`ai_analytics_digest_enabled`; для повестки — непустой `ai_analytics_rop_user_ids`;
для сводного дайджеста — непустой `ai_analytics_digest_all_user_ids`, флаг
дайджеста не нужен; `tickDigest` ставит `digest` и `digest_all` по очереди)
→ `QueueDispatcherService.dispatch(SALES_KPI_REPORT, SALES_AI_ANALYTICS_PUSH,
{domain, kind, date}, jobId)` с `jobId = ai-analytics:push:{kind}:{domain}:{date}`
(дедуп повторного тика за день; `date` — день в TZ портала) →
`AiAnalyticsQueueProcessor` → `AiAnalyticsPushUseCase.execute` (тот же код, что
у ручки `ai-analytics/push`; `attempts: 1`, поэтому исключение и итог `failed` — error-лог с Telegram и rethrow/возврат результата). Пропуск наступившего слота, когда рассылка настроена частично (адресаты `digest_all` заданы, а `ai_analytics_enabled` выключен; личный дайджест выключен или включён без AI-аналитики), пишется warn'ом один раз на слот портала (`cron/push-slot.rules.ts`); портал без настроек рассылки пропускается молча.

| Вид | Кейс | Получатели | Текст | Идемпотентность |
|---|---|---|---|---|
| `agenda` | `PushAgendaUseCase` | РОПы из настроек | `buildAgendaMessage`: 3 звонка недели — менеджер («Фамилия Имя» через `user.get`, fail-open `#id`), тип звонка, причина, цитата (≤ 300 симв.), ссылка на карточку разбора; пункт «Несогласия недели» | одна запись `agenda_sent` (`object = agenda:{weekKey}`) на домен+неделю, ищется с понедельника недели |
| `digest` | `PushDigestUseCase` | каждый менеджер (bitrix-id = `managerId`) | `buildDigestMessage`: «Вчерашние звонки: что сказать иначе» — до 3 звонков с худшим разделом, «было» и до 3 дословных фраз `alternatives`, ссылка | одна запись `digest_sent` (`object = digest:{day}`, `managerId`) на домен+менеджер+день; в выходной (календарь портала) не шлётся |
| `digest_all` | `PushDigestAllUseCase` | адресаты `ai_analytics_digest_all_user_ids` (`ai_analytics_digest_enabled` НЕ нужен — достаточно непустого списка) | `buildDigestAllMessage` (`delivery/ai-analytics-digest-all-message.util.ts`): «Сводный разбор звонков за вчера» — периметр вкладки AI без фильтра (`AiManagerScopeResolver`: список разбора звонков, без него — ростер ОП) ∪ менеджеры со звонками, по отделам (`ManagerOrgLoader.departmentName`; «Без отдела» последним), на менеджера ≤ 3 звонка (`AI_ANALYTICS_DIGEST_ALL_CALLS_PER_MANAGER`) «время · раздел — «одна лучшая фраза»» + ссылка, «Звонков не было: …» для остальных, в конце «Итог, кому что» (менеджер → разделы); пустой день отправляется одной строкой «Звонков не было» | одна запись `digest_sent` с `object = digest_all:{day}`, `managerId = null` на домен+день (проверяется до расчёта; сбой записи после доставки — error-лог с Telegram, результат — фактическая доставка); в выходной не шлётся; тот же крон 08:00; имена — `UserNamesReader` (один `user.get` с `=ID` на 50 id) |

Записи доставки — те же ais-записи контракта 4 (`AiAnalyticsPushLogStore` над
`AiAnalyticsFeedbackStore`), `payload` — доставленные и `transcriptionIds`.
Уведомления — `bitrix.imNotify.systemAdd` с `TAG` (`ai-analytics:agenda:{weekKey}`,
`ai-analytics:digest:{day}:{managerId}`, `ai-analytics:digest_all:{day}`): сбой одного получателя не мешает остальным; доставленным считается только ответ с id уведомления — `result: false` (уведомление не создано) даёт warn и в `delivered` не попадает;
никому не доставлено → `status: failed`, отметка не пишется.

Ручной запуск `POST ai-analytics/push` (руководители): `date` — «как если бы крон
сработал в этот день» (момент расчёта — полдень дня в TZ портала), `recipients` —
тест «отправить себе»: повестка уходит им вместо РОПов, дайджест каждого менеджера —
им с подписью «Менеджер: …», сводный дайджест — им вместо адресатов из настроек;
флаг дайджеста, выходные и отметки `*_sent` при этом не применяются и не пишутся.

Источник данных — `CallReportAnalyticsDataService.loadLite` (`@lib/call-lib`,
без текста транскрипта); модель — чистые функции `@lib/sales-ai-analytics`
(`computePulse`, `buildAgenda`, `buildMorningDigest`, календарь рабочих дней).

Ссылка на разбор: `https://{domain}/crm/type/{entityTypeId}/details/{itemId}/`
— `entityTypeId` из `PbxAicallSmartService.resolveInfo`, `itemId` —
`report_item_id` ais-записи `agent-analysis` звонка (как в weekly-report).

## Аудит данных (Фаза 0)

Месячный снапшот аудита: `cron/ai-analytics-audit.scheduler.ts` 1-го числа 04:10 МСК ставит джобу `SALES_AI_ANALYTICS_SNAPSHOT` (kind audit, jobId по домену и месяцу) по порталам с признаком `ai_analytics_audit_enabled`; `domain/use-cases/audit-snapshot.use-case.ts` считает отчёт через `AiAnalyticsAuditService` из `@lib/sales-ai-analytics` и пишет снапшот в ais (source cron). Ручки аудита живут в apps/admin (`SalesAiAnalyticsAdminModule`), здесь их нет. CLI: `audit/run-ai-analytics-audit.ts` (`npm run audit:ai-analytics`). Самоописание аудита и признак портала — в ответе `settings/get` (`auditEnabled`) и в `GET admin/ai-analytics/audit/about`.

## Обзор менеджер × тип (Фаза 1b)

Ручки второго контроллера `ai-analytics-overview.controller.ts` (тот же тег и
префикс; отдельный файл ради «≤ 300 строк»). Все POST, общие фильтры
`AiOverviewFiltersDto`: `domain`, `requesterUserId`, `from`, `to` (YYYY-MM-DD в
TZ портала, `from ≤ to`, не длиннее 3 мес. — валидатор
`dto/validators/overview-period.validator.ts` и повторно `OverviewUseCase`),
`managerIds?` (пусто — весь ростер ОП по структуре), `confirmedOnly?`
(принимается, входит в ключ, фильтрация — Фаза 3), `socketId?`, `forceRefresh?`.

**Периметр вкладки AI** (решение владельца 30.09.2026): строки = (`managerIds`
фильтра или весь ростер ОП) ∩ список разбора звонков
(`portal_ai_settings.allowed_user_ids`). Список действует, только когда разбор
включён и список непуст; пустой список — ограничения нет, разбор выключен или
запись не прочитана — тоже (fail-open). Единственное место пересечения —
`domain/access/ai-manager-scope.resolver.ts` (`AiManagerScopeResolver`, ядро;
чистые правила — `ai-manager-scope.util.ts`): через него идут ключ и джоба
обзора, строки/итоги/итоги отделов/возражения/«год назад»/медиана команды
(lite-строки звонков режутся по периметру, звонки без сотрудника остаются только
в `meta.skippedNoManager`), срезы by-type, итоги периода (brief), план-факт и
сводный дайджест. Пустое пересечение — `ready` с пустым обзором без джобы, ключ
с маркером `none` (не `all`). `meta.scope {pilotActive, shownManagers,
hiddenByPilot}` считается ручкой по фильтру запроса. Прогноз отдела, ночной
конвейер, пульс и повестка периметр не используют (деньги отдела делают все,
конвейеру нужен полный ростер). Матрица обзора режет «короткие» по порогу портала
(`portalMinDurationByType`, как пульс); `meta.excludedShort|NoType|NoAnalysis` и
`coverage` среза by-type объясняют пустые матрицы.

| Ручка | Режим | Права | Ответ |
|---|---|---|---|
| `ai-analytics/overview` | очередь + WS + кэш | периметр | `AiOverviewResponseDto {status, requestKey, jobId?, data?: AiOverviewDto, message?}` |
| `ai-analytics/attention` | sync над кэшем обзора | периметр | `AiAttentionResponseDto {…, data?: AiAttentionDto {from, to, items[], managersConsidered}}` |
| `ai-analytics/by-type` | sync над кэшем обзора | периметр | `AiByTypeResponseDto {…, data?: AiByTypeDto {callType, title, layout, period, wide, long, totals, totalsByType, objections}}`; `callType` — `all` (все типы вместе), тип из `CALL_REPORT_CALL_TYPE_CODES` либо `objections` (`AI_ANALYTICS_BY_TYPE_CODES`, `all` первым); `layout: wide` (по умолчанию) / `long` |
| `ai-analytics/settings/save` | sync | только `cup`/`op` | `AiSettingsSaveResponseDto {status: ready, requestKey, data: {id, levels[], savedAt, resetCount, comparableFrom, paramsVersion, breaksSeries[], warnings[]}}` |

**Конверт обзора.** `requestKey` = ключ кэша = `jobId`:
`sales-ai-analytics:v1:{domain}:overview:v5:{from}_{to}:{usersKey}:{0|1}`, где
`usersKey` — нормализованный периметр (фильтр ∩ список разбора;
`overviewUsersKey`: дедуп, сортировка, `10_20`, пусто — `none`), последний
сегмент — `confirmedOnly`; `v5` — версия формы кэша (`OVERVIEW_KEY_VERSION`,
меняется вместе с формой: v3 — `riskCalls[].link`, v5 — периметр разбора,
`meta.scope`, счётчики исключений, порог длительности портала), она же уезжает
в `jobId` и `requestKey` WS-событий. Поток
(`domain/use-cases/overview-lookup.use-case.ts`): попадание → `ready` (строки уже
в периметре requester'а, `meta.fromCache = true`); в кэше error-конверт → `error`
с `message` (живёт 120 с); джоба с таким id ждёт/идёт → `processing`; промах →
`dispatch(SALES_KPI_REPORT, SALES_AI_ANALYTICS_OVERVIEW, jobData, requestKey,
{priority: 1, attempts: 1, timeout: 120000, removeOnComplete/Fail})` → `queued`.
`forceRefresh` не читает кэш, но идущую джобу не дублирует. Периметр: менеджер
без `headOf` получает только свою строку `managers[]`, свои `objections.byManager`
и свой id в `departmentTotals[].managerIds`; `totals` по периметру обзора остаются.

**Процессор** (`queue/ai-analytics.processor.ts` → `OverviewJobUseCase`):
`OverviewUseCase` (периметр `AiManagerScopeResolver` → параллельно `CallsLoader.loadLite` за UTC-окно
периода, `KpiLoader.loadKpiMonths`, `FinanceLoader.loadFinance`,
`PlansLoader.loadPlans`, `ManagerOrgLoader`, уровни из
`AiAnalyticsSettingsStore`, несогласия из `AiAnalyticsFeedbackStore` →
assembler → `buildOverviewDto` → ссылки риск-звонков строк на карточки разборов
одним вызовом `SmartLinkLoader` на весь обзор, fail-open: `link = null`) →
write-through `{status: 'ready', data}` c TTL
по положению периода (`overviewTtlSeconds`: целиком в закрытых месяцах — 30 дней,
закончился до сегодня — 1 ч, включает сегодня — 180 с) → WS
`ai-analytics:overview:done` `{requestKey, generatedAt}` на `socketId`. Сам
обзор по WS **не** уходит (кэш общий на домен, периметр применяется ручкой) —
фронт по событию повторяет POST с тем же `requestKey`. Ошибка → в кэш
`{status: 'error', message}` на 120 с → WS `ai-analytics:overview:error`
`{requestKey, message}` → rethrow (джоба failed, ретраев нет).

**Поля `AiOverviewDto`** (`dto/ai-overview.dto.ts`): `period {from, to,
timeZone, days, workdays}`, `readiness`, `calcVersion` (`sam-1.0.0`), `versions
{prompt, rubric, registry, attribution, classifier, distinct}`, `comparableFrom`,
`managers: AiManagerRowDto[]` (`managerId, departmentId, groupId, level,
levelSource, tenureMonths, workdays, signal, keyMetric, funnelShape, buckets[],
byType: AiManagerTypeCellDto[], funnel[], finance, discipline, callsTotal,
analyzedCalls, nextStepRate, riskCalls[] {transcriptionId, kind, callStartedAt,
link — карточка разбора в смарте, null — элемента нет}, recommendations[]`), `totals:
AiTypeTotalsDto[]` (ячейка типа + `managers`), `departmentTotals[]
{departmentId, managerIds, totals}`, `objections {byManager[], totals[], n}`,
`meta {totalCalls, analyzedCalls, skippedNoManager, otherSharePct,
disagreementsCount, fromCache, generatedAt, confirmedOnly}`. У каждого менеджера
ячейка есть по всем типам справочника (n = 0 — «мало данных», `score.value =
null` при n < 8).

**«Длинная» раскладка by-type** — строки `AiByTypeLongRowDto {managerId,
callType, kind: score|section|checklist|kpi|objection, indicator, title, metric:
MetricDto, explanation}` в порядке: оценка типа → разделы рубрики → чек-листы →
KPI-факты (для `objections` — категории возражений, `callType = objections`).
«Широкая» — `AiByTypeWideRowDto {managerId, level, departmentId, cell,
primaryKpi, finance}`, тип строки — `cell.callType`.

**Псевдотип `all`** (`AI_ANALYTICS_BY_TYPE_ALL`, пункт «Все» переключателя):
пары «менеджер × ячейка `byType`» в порядке менеджеров обзора и типов
справочника (`row.byType` уже упорядочен `compareCallTypes` — как ключи
`AI_ANALYTICS_EVENT_KINDS` и `settings.callTypes[]`); `other` / `irrelevant` не
отбрасываются — ячейки по ним в обзоре есть (`bucket = null`); приглашение на
мероприятие (`event_invite`, `bucket = null`, `column = true`) — своя ячейка с n
и оценкой вне средней (см. раздел «Тип «Приглашение на мероприятие»»). `wide` — строка на
пару, `long` — те же строки, что у одиночного типа, с `callType` строки;
`title = «Все типы»`, `totals = null`, `totalsByType = overview.totals` (для
остальных `callType` — `totals` по типу и `totalsByType = null`),
`objections = null`. Сборка — `domain/presenter/by-type.presenter.ts`
(`pairsOf` общий для одиночного типа и `all`).

**settings/save** (`domain/use-cases/settings-save.use-case.ts`): в Фазе 1b —
только `levels[] {managerId, level: junior|middle|senior, since?}`, каждый
`managerId` в периметре requester'а (403), `since ≤ сегодня` в TZ портала и без
дублей (400). Уровень попадает в строку обзора как `levelSource = manual`,
`tenureMonths` — от `since`; без записи — `default` по стажу. В Фазе 2 ручка
выросла до девяти блоков, уровни переехали с временного снапшота
`ai-analytics-settings` на ключ схемы, а сброс кэша дополнился `model` и `plan` —
см. раздел «Настройки портала и параметры расчёта (Фаза 2, волна 2)».

**Прогрев** (`cron/ai-analytics-overview-prewarm.scheduler.ts`): ежедневно
05:30 МСК (`AI_ANALYTICS_PREWARM_CRON = '30 2 * * *'` UTC — после ночных
KPI-пересчётов; своего события «ночной отчёт готов» в kpi-report-sales нет) по
порталам с `ai_analytics_enabled` ставит джобу обзора за период по умолчанию
(`defaultOverviewPeriod`: 4 недели до вчерашнего дня в TZ портала, весь ростер)
с `forceRefresh: true`, `priority: 10`; `jobId` = тот же `requestKey`, что
построит фронт без фильтров — повторный тик и клик пользователя не дублируют
джобу.

**Финансовый хвост v2** (`AiFinanceTailDto`, `dto/ai-finance-tail.dto.ts`;
решение владельца А.2, ai/tasks/ai-sales-analytics-inputs.md). Источник —
тот же `HotClientsUseCase` sales-finance, что и вкладка «Финансы → Горячие
клиенты»: `FinanceLoader` зовёт его один раз с порогом `presentation`
(самый широкий, кэш sales-finance уже прогрет вкладкой) и режет в памяти
(`domain/loaders/finance-pipeline.assembler.ts`, чистые функции). Правило
«горячего»: открытая сделка sales_base со стадией **≥ «В решении»**
(`AI_ANALYTICS_HOT_STAGE_CODE = PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress`,
order 8; `sales_refine`/`sales_document_send` — не горячие); цвет компании
(UF `op_prospects`) — разрез, а не условие. Поля: `pipelineFromStage {count,
monthlyAmount}` (весь пайплайн от презентации), `hotEvents`, `hotByColor
{green, yellow, red, none}` (`AI_ANALYTICS_COMPANY_COLORS` + `none` для
null/чужого значения), `withOfferCount` (горячих с товарными строками,
`productRowsAmount > 0`), `pipelineByContractType[] {code, name, count,
monthlyAmount, advanceAmount}` (весь пайплайн, порядок по `code`, `null`
последним, только непустые), `pipelineByTerm[] {bucket, count, monthlyAmount,
expectedContractAmount}` — бакеты `AI_ANALYTICS_CONTRACT_TERM_BUCKETS`
(`3|6|12|24|none`) по `countContractMonths` из `@lib/shared` (≤ 3 → 3, ≤ 6 →
6, ≤ 12 → 12, дольше → 24, нет дат → `none`), `expectedContractAmount = Σ
round2(monthlyAmount × месяцы)`, для `none` — `null`. Закрытые продажи
(`salesCount`, `advanceAmount`, `monthlyAmount`) — одним вызовом
`ClosedSalesUseCase` за весь период обзора, как вкладка «Финансы» (те же
даты и формула); своего кэша у AI нет — кэш только у sales-finance (общий на
домен закрытый месяц), помесячная разбивка для ночного шага — по дате
закрытия сделок (`finance.assembler.ts`). Порог `decision` в `SALES_HOT_THRESHOLDS` не заводится.
Тесты: `finance-pipeline.assembler.spec.ts` (фикстура
`__tests__/fixtures/hot-clients.fixture.ts`), `finance.loader.spec.ts`.

**Кэш и сброс.** Ключи модуля: `overview:v5:{from}_{to}:{usersKey}:{c}`,
`kpi-month:{yyyy-MM}:{usersKey}[:{from}_{to}]`,
`finance-pipeline:{pipelineThreshold}-{hotStageCode}:{usersKey}`, `plans:{usersKey}`, `managers`,
`managers:org`, `managers:scope` (периметр вкладки без фильтра, публикует
`AiManagerScopeResolver` для итогов периода, 5 минут). `POST ai-analytics/cache/reset {scope}`:
`pulse|agenda|settings|overview|attention|kpi-month|plans|all`
(`attention` — резерв, сейчас считается синхронно над `overview`).

Экспорт из `index.ts` (сверх Фазы 1a): `OverviewUseCase`, `OverviewLookupUseCase`,
типы `OverviewInput`, `OverviewLookup`, `OverviewKeyRef`, `AiOverviewJobData`,
`AiOverviewCacheEntry`, `AiOverviewWsDonePayload`, `AiOverviewWsErrorPayload`.

Тесты 1b: `overview-controller.spec.ts` (hit → ready, miss → queued, повтор →
processing, forceRefresh, jobId = ключ, периметр менеджера, settings/save 403),
`overview.use-case.spec.ts` (итоги = суммы ячеек, n < 8 → null, период > 3 мес. →
400, аргументы loader'ов), `attention.use-case.spec.ts`, `by-type.use-case.spec.ts`
(long/wide/objections, `all` — число строк = Σ ячеек, порядок, `callType` строк,
`totalsByType`), `dto-validation.spec.ts` (by-type: `all`/тип/`objections`, мусор → 400),
`settings-save.use-case.spec.ts`, `overview-job.spec.ts` (TTL, WS, ошибка →
error-конверт + rethrow), `overview-prewarm-scheduler.spec.ts`; 07.09.2026 —
`requester-access.service.spec.ts` (`resolveViewer`), контроллеры (менеджер →
403 при выключенной `self_view`, self-only при включённой),
`digest-all-message.util.spec.ts` (отделы, лимит 3, пустой день),
`push-digest-all.use-case.spec.ts` (адресаты, дедуп по дате, «себе»),
`push-scheduler.spec.ts` (`digest_all` только при непустом списке); фикстура
`__tests__/fixtures/overview.fixture.ts` строит настоящий `AiOverviewDto` по
lite-строкам без Bitrix.

## Снапшоты модели (Фаза 2, волна 1)

Хранилище снапшотов Фазы 2 пишет ночной конвейер (см. раздел «Ночной
конвейер снапшотов и его сборка»), читают ручки Фазы 2 (план дня, резюме,
карточка стиля) и обзор. Провайдер объявлен один раз — в ядре
`core/ai-analytics-core.module.ts`.

| Файл | Что даёт |
|---|---|
| `store/snapshot-serialize.util.ts` | чистая раскладка `SnapshotEnvelope` ↔ колонки `ais`: `toAisRecord` / `fromAisRecord`, `periodKeyOf`, `isSnapshotPeriodKey`, `snapshotHashKey` (sha1, 16 hex), `toManagerUserId`, `parseSnapshotStatus` |
| `store/ai-analytics-snapshot.store.ts` | `@Injectable AiAnalyticsSnapshotStore` поверх `AiService` (`@lib/call-lib`): `upsert`, `findByKeys`, `latest`, `prune` |

Раскладка по колонкам `ais`: `provider` / `app` = `ai-analytics`, `type` — код
из реестра снапшотов библиотеки (`AI_ANALYTICS_SNAPSHOT_TYPE`), `activity_id` —
ключ периода по зерну типа (`YYYY-MM`, `YYYY-Www`, `YYYY-MM-DD` или хэш
входов), `user_id` — менеджер (портальное зерно менеджера не хранит), `model` —
`calcVersion`, `user_result` — `paramsVersion`, `inputsHash`, `generatedAt` и
нагрузка. Источник истины по версиям — конверт, в нагрузках они не дублируются.
Любая невалидная запись (чужой тип, ключ не по зерну, битый `user_result`,
менеджерское зерно без менеджера) читается как `null`, без исключений.

`upsert` переводит прежние записи ключа в `status = 'superseded'` и создаёт
новую. **`prune` физически ничего не удаляет** — в `AiRepository` нет `delete`,
поэтому просроченные по ретенции записи выводятся из актуальных тем же
`superseded`; физическая чистка — джоба Фазы 3 после появления
`AiRepository.delete` в `@lib/call-lib`.

Провайдер зарегистрирован в `AiAnalyticsModule` (`providers` + `exports`),
новых `imports` не потребовалось: `AiModule` уже подключён ради обратной связи.
Литерал типа записи настроек больше не дублируется —
`AI_ANALYTICS_SETTINGS_RECORD` в `constants/ai-overview.const.ts` ссылается на
`AI_ANALYTICS_SETTINGS_TYPE` / `AI_ANALYTICS_SNAPSHOT_APP` /
`AI_ANALYTICS_SNAPSHOT_PROVIDER` из `@lib/sales-ai-analytics`.

Чистая математика Фазы 2 (реестр параметров и `paramsVersion`, нормы и κ,
качество за период и надёжность) живёт в `@lib/sales-ai-analytics` — см. её
README, раздел «Фаза 2, волна 1». С волны C (18.09.2026) её зовут шаги
ночного конвейера и ручки Фазы 2 (раздел «Ручки Фазы 2»).

Тесты: `__tests__/snapshot-serialize.util.spec.ts` (round-trip по всем 10 типам
и 6 зёрнам, битые записи → `null`, ключи периодов, хэш),
`__tests__/ai-analytics-snapshot.store.spec.ts` (`upsert` + `superseded`,
фильтры `findByKeys`, окно `created_at`, `latest`, `prune` по ретенции
дескриптора), `__tests__/ai-analytics-module-di.spec.ts` (провайдер разрешается
в графе модуля).

## Настройки портала и параметры расчёта (Фаза 2, волна 2)

`settings/save` вырос с одних уровней до **девяти блоков** настроек, которые
хранятся ключами `[kpiSales]` схемы `portal-app-settings.schema.ts` (JSON-строки,
разбор — чистые функции `@lib/sales-ai-analytics/settings/*`, битый JSON даёт
дефолт кода, а не 500). В волне 2 это была единственная подключённая ручка
Фазы 2; с волны C (18.09.2026) подключены и модель портала (ночной
конвейер), и план дня, резюме, стиль, слепая проверка, «Как считаем».

| Блок запроса | Ключ настроек | Что задаёт |
|---|---|---|
| `levels` | `ai_analytics_levels` | уровни менеджеров и начало стажа (переезд с временного снапшота `ai-analytics-settings`; при пустом ключе — одноразовый fallback на старый снапшот) |
| `targets` | `ai_analytics_targets` | цели по уровням и личные переопределения |
| `absences` | `ai_analytics_absences` | отсутствия менеджеров (экспозиция норм) |
| `managerParams` | `ai_analytics_manager_params` | слой параметров менеджера: `fteShare`, цель, исключение из норм, немой алерт |
| `definitions` | `ai_analytics_definitions` | определения владельца: продуктивный звонок, канон презентации, «горячий» клиент, пороги длительности, рёбра воронки, слой нормы |
| `events` | `ai_analytics_events` | журнал событий портала (+ автособытие `settings_break`) |
| `modelParams` | `ai_analytics_model_params` | гиперпараметры модели — только коды реестра, диапазоны из `findParam(code).range` |
| `scoring` | `ai_analytics_scoring` | потолки оценивания (≤ 20 правил, `maxScore ∈ [1; 9]`) и стоп-фразы (≤ 100) |
| `hypothesis` | `ai_analytics_hypothesis` | гипотеза «при качестве S нужно N презентаций» (≥ 2 пар) — делает достижимым `betaSource: 'hypothesis'` |
| `rosterConfirmedAt` | `ai_analytics_roster_confirmed_at` | дата подтверждения состава ростера РОПом |

Три следствия каждого сохранения: пишутся **только изменившиеся** ключи,
сбрасываются кэши `overview` / `attention` / `model` / `plan`
(`AI_ANALYTICS_SETTINGS_RESET_SCOPES`) и создаётся снапшот
`ai-analytics-settings-audit` с автором, списком изменений и границей
`comparableFrom` до/после. Правка поля с `breaksSeries` двигает
`comparableFrom` вперёд и оставляет в журнале автособытие — ответ возвращает
`comparableFrom`, `paramsVersion`, `breaksSeries[]` и `warnings[]`.

| Файл | Что даёт |
|---|---|
| `domain/loaders/settings.loader.ts` | к прежним флагам добавились десять разобранных блоков (`levels`, `targets`, `absences`, `modelParams`, `managerParams`, `definitions`, `events`, `scoring`, `hypothesis`, `rosterConfirmedAt`) |
| `domain/loaders/params.loader.ts` | `@Injectable AiAnalyticsParamsLoader.load(domain, { managerId?, tenureBand?, model? })` → `{ ctx, paramsVersion, comparableFrom }` — раскладка настроек по слоям реестра (менеджер → полоса стажа → портал → дефолт). Провайдер объявлен в ядре `core/`; потребители — контекст прогона конвейера (`pipeline/run-context.factory.ts`), портальная модель (`portal-model.use-case.ts`), резюме (`brief-job.use-case.ts`) и блок «Как считаем» (`about/`) |
| `domain/use-cases/settings-save.use-case.ts` + `settings-save.mapper.ts` | периметр (403), блокирующая проверка значений (400), запись изменившихся ключей, сброс кэшей, аудит |
| `store/ai-analytics-settings.store.ts` | `savePortalSettings(domain, patch)` поверх `PortalAppSettingsService` (portalId — по `PortalService.getPortalByDomain`), `loadLevels` с fallback на старый снапшот |
| `store/ai-analytics-settings-audit.store.ts` | `@Injectable AiAnalyticsSettingsAuditStore.save(...)` — запись `ai-analytics-settings-audit` в ais поверх `AiService` |
| `dto/ai-settings-*.dto.ts` | блоки запроса и ответа с русскими описаниями; `levels` стал необязательным (не передан — уровни не меняются) |

Тесты: `__tests__/settings-save-phase2.spec.ts` (девять блоков, 400/403, аудит,
сдвиг `comparableFrom`), `__tests__/settings-parsers.spec.ts` (загрузчик и
переезд уровней), `__tests__/params.loader.spec.ts` (слои и `paramsVersion`),
`__tests__/settings-save.use-case.spec.ts` (прежние сценарии уровней),
`__tests__/ai-analytics-module-di.spec.ts` (оба новых провайдера разрешаются
в графе модуля).

## Ручки Фазы 2 (план дня, резюме, стиль, слепая проверка)

Тот же тег и префикс `ai-analytics`, все POST с `domain` и `requesterUserId`;
у каждого среза свой контроллер и свой модуль (§1.6 п. 2 плана), сборка
`ai-analytics.module.ts` их импортирует. Поверхность API приложения — ровно
семь контроллеров фичи (два корневых + пять срезов), чужих через
транзитивные импорты нет — закреплено `__tests__/ai-analytics-module-di.spec.ts`
и дампом схемы до/после (поток 19).

| Ручка | Модуль | Режим | Права | Ответ |
|---|---|---|---|---|
| `ai-analytics/plan/daily` | `plan/` | sync по снапшотам `forecast` / `portal-model` / `manager-month`, кэш 180 с | периметр (`resolveViewer`); `ai_analytics_daily_plan_enabled = false` → 403 | `AiDailyPlanResponseDto {…, data: AiDailyPlanDto}` — G → Y₀ → λ_pipe → N_req → разворот → потолок, `ropOnly` руководителю |
| `ai-analytics/brief` | `brief/` | очередь + WS + кэш 6 ч (джоба `SALES_AI_ANALYTICS_BRIEF`, `jobId = requestKey`, WS `ai-analytics:brief:done|error`); снапшот `ai-analytics-brief` с ключом периода `{from}_{to}_{ростер}` — см. ниже | периметр (`resolveViewer`) | `AiBriefResponseDto {…, data?: AiBriefDto}`; без ключа VibeCode / при исчерпанной квоте / провале факт-чека — `source = template` с причиной |
| `ai-analytics/manager/style` | `style/` | sync по снапшоту `ai-analytics-style` | периметр; сам сотрудник — по себе; `ai_analytics_style_opt_out` → `status: opt_out` | `AiStyleCardDto {status: ready|few_data|opt_out, notable[], axes[], …}` |
| `ai-analytics/rop-mark/pick` | `rop-mark/` | sync, лёгкая выборка недели | только руководители (`cup`/`op`/`group`), менеджеру 403; суперпользователю вендора `forceRefresh` — 403, без сохранённого подбора — предпросмотр без записи | `AiRopMarkWeekResponseDto {…, data: AiRopMarkWeekDto}` — до трёх звонков, слепой режим до метки |
| `ai-analytics/rop-mark/list` | `rop-mark/` | sync | только руководители | тот же конверт: сохранённый подбор и метки, без подбора — пустой `calls` |
| `ai-analytics/rop-mark/save` | `rop-mark/` | sync, запись в `ais` | только руководители, суперпользователю вендора 403; звонок вне периметра 403, вне подбора 400 | `AiRopMarkSaveResponseDto {…, data: {id, replaced, blind}}` |
| `ai-analytics/about` | `about/` | sync: настройки портала + последняя модель портала из `ais`, без кэша | периметр (`resolveViewer`) | `AiAboutResponseDto {status: ready, requestKey, data: AiAboutDto}` — блок «Как считаем» ручки `endpoint: overview | plan/daily | brief | manager/style`: тексты, `params[]` (код, значение, слой, класс) из реестра, `paramsVersion`, `comparableFrom`, `model` (readiness с причинами, κ/φ/λ с источником `estimated|configured|hybrid`, `betaSource`, `estimand`, санити) либо `model: null` + `modelReason` |

`requestKey` конвертов: план дня — `…:plan:{date}:{managerId}`, резюме —
`…:brief:{promptVersion}:{packHash}`, проверка — `…:rop-mark:{weekKey}`
(подбор и список) и `…:rop-mark:{transcriptionId}` (метка), блок «Как
считаем» — `…:about:{endpoint}`; префикс общий
`sales-ai-analytics:v1:{domain}`.

**Резюме версии 2 «что изменилось и что делать»** (`brief-2.0.0`).
Пункты трёх групп: `change` — факт против прошлого периода той же длины,
`focus` — старшая карточка «Внимания» менеджера (до трёх разных людей),
`action` — действия недели. Сравнение одно и то же везде: период против
примыкающего прошлого периода той же длины, обе стороны — по обзору
своего окна; числа запасных источников (пульс, недельные и месячные
снапшоты) несут в подписи своё окно и с прошлым периодом не
сравниваются. Джоба резюме перед сборкой пакета добивается обоих обзоров
в кэше (`domain/use-cases/brief-job.prev.ts`: кэш по периметру или по
всему ростеру, иначе джоба обзора с ожиданием до 45 с); не дождалась —
резюме без сравнения, первым пунктом фраза о причине. Действия всегда
выводят правила из фактов пакета (`libs/sales-ai-analytics`
`model/brief-actions.ts`) — нейросеть пишет только заголовок, изменения
и фокус, и каждое её число сверяется с пакетом. Готовое резюме такого же
пакета берётся из кэша без повторного вызова нейросети.

**Снапшот резюме и его ретенция** (волна C, долг 40). Кэш и `jobId`
резюме по-прежнему адресуются хэшем пакета фактов (`buildBriefKey`), но
запись `ais` типа `ai-analytics-brief` пишется с ключом периода
`{from}_{to}_{ростер}` (`buildBriefPeriodKey`, `brief/brief-cache-key.util.ts`;
ростер — нормализованный `buildReportUsersKey`, длинный — его хэш, чтобы
не выйти за потолок зерна), `managerId = null`, а `packHash` лежит в
`inputsHash` конверта и в нагрузке `BriefSnapshot.packHash`. Поэтому новое
резюме того же периода и состава замещает прежнее (`upsert` → `superseded`),
повтор с тем же пакетом записи не создаёт, и рост `ais` ограничен числом
периодов, а не числом запросов (дескриптор типа — ретенция 30 дней).
Спека — `__tests__/brief-cache-key.util.spec.ts`, `brief-job.use-case.spec.ts`.

**Готовность витрины** (`readiness` в `settings/get`, обзоре, плане дня и
«Как считаем»). Режим и причины считает только библиотека
(`buildReadiness` / `buildWindowedReadiness` в `@lib/sales-ai-analytics`),
приложение подставляет счётчики окна модели портала через
`modelReadinessOptions(model)` — одним адаптером `domain/presenter/readiness.util.ts`
и для обзора, и для `settings/get` (`settings.use-case.ts`). Кап §5.4 плана:
нет снапшота `ai-analytics-portal-model` → режим не выше `descriptive`
с причиной `no-portal-model` (признак `portalModelPresent`, обёртка
`readiness-window.ts` выводит его из наличия окна модели). `historyMonths`
в `AiReadinessDto` — из окна модели портала (глубина истории стадий), без
модели — по первому разобранному звонку в периоде.

Блок «Как считаем» генерируется, а не пишется руками (§6): слова — в
`about/ai-analytics-about.const.ts` (по ручке: назначение, источники, как
читать, границы и перечень кодов реестра), числа — только из
`resolveParam` по контексту портала и из нагрузки `ai-analytics-portal-model`.
`__tests__/about.spec.ts` транзитивно сканирует исходники каждой ручки и
требует, чтобы каждый найденный код параметра был в её перечне; новый
код в ручке → дописать в const, иначе спека красная.

## Ядро общих провайдеров (`core/`)

Провайдеры без состояния, которые раньше дублировались в шести модулях
(долг N8 аудита), объявлены один раз и экспортированы:

| Модуль | Провайдеры | Импортирует |
|---|---|---|
| `core/ai-analytics-core.module.ts` — **без Битрикса** | `AiAnalyticsCacheService`, `SettingsLoader`, `AiAnalyticsParamsLoader`, `AiAnalyticsPortalsLoader`, `ManagersLoader`, `CallsLoader`, `AiAnalyticsSnapshotStore`, `RequesterAccessService` | все срезы, конвейер и корневой модуль |
| `core/ai-analytics-core-pbx.module.ts` — с `PBXModule` | `KpiLoader`, `SalesFinanceUseCaseFactory`, `FinanceLoader`, `PlansLoader`, `AiAnalyticsSettingsStore` (нужен `PortalService`), `StyleCrmLoader` (телефония + лиды для жёстких осей стиля; нужен `PBXService`) | снапшоты, паспорт, модель портала, корневой модуль |

Разделение по границе Битрикса намеренное: срезы плана дня и резюме не
должны тянуть `PBXModule` даже транзитивно (это проверяют их DI-спеки), а
поддерево `PBXModule` несёт чужие контроллеры. DI-спека сборки закрепляет,
что ни один провайдер не объявлен дважды и ядро экспортирует ровно свой
состав.

## Порог длительности разбираемого звонка (решение владельца А.1)

Единая цепочка источников у всех контуров — `resolveMinDurationByType`
(`@lib/sales-ai-analytics`, `settings/min-duration.resolve.ts`):

1. явный порог **по типам** портала — карта `minDurationSecByType` в
   `ai_analytics_definitions` либо код `min_duration_sec_by_type` в
   `ai_analytics_model_params`;
2. явный общий **скаляр** портала — код реестра `min_duration_sec` в
   `ai_analytics_model_params` (с волны C у кода есть потребитель);
3. **прежний скаляр старой админки разбора** —
   `portal_ai_settings.min_duration_sec` (`fallbackSec`);
4. дефолт реестра `min_duration_sec_by_type` — 300 с (`registryMinDurationSec()`).

В этом приложении цепочку собирает `domain/loaders/min-duration.util.ts`
(`portalMinDurationByType(settings)`): `SettingsLoader` читает старую админку
через `@Optional() PortalAiSettingsService` (`legacyMinDurationSec`; сервис не
подключён или упал → `null`) и считает признак `minDurationDefined` по сырому
JSON — иначе дефолт парсера был бы принят за решение портала. Карту берут
пульс, шаги `calls` / `finance` / `sanity`, недельный и месячный снапшоты;
CLI аудита Фазы 0 (`audit/run-ai-analytics-audit.ts`, `auditShortCallSecOf`)
и админский `AiAnalyticsAuditService` идут той же цепочкой с тем же запасным
скаляром. Разбор в event-sales (`call-report-settings.service.ts`), гейт
порога типа после классификации и скан берут ту же функцию библиотеки —
порог, заданный в любом из мест, одинаков для разбора, пульса, ночного
расчёта и аудита. Спеки: `__tests__/min-duration.util.spec.ts`,
`__tests__/settings.loader.spec.ts`, `__tests__/ai-analytics-audit.cli.spec.ts`.

## Ночной конвейер снапшотов и его сборка (Фаза 2, волны 3–4, сборка — поток 19)

Все тяжёлые расчёты Фазы 2 считает один ночной конвейер: раннер
(`pipeline/snapshot-pipeline.service.ts`) берёт слот портала, собирает
контекст прогона (ритм, ключи периода, TZ, производственный календарь,
настройки, слои реестра параметров, версии, ростер) и последовательно
выполняет шаги ритма, передавая значения через шину (`StepBus`). Пропуск
шага не останавливает прогон (журнал «частично»), падение — останавливает,
но журнал `ai-analytics-etl-run` всё равно пишется. Шаги инжектятся
токеном `AI_ANALYTICS_PIPELINE_STEPS`: раннер не импортирует их напрямую,
иначе срезы замкнулись бы в цикл.

**Порядок шагов** (`AI_ANALYTICS_PIPELINE_STEP_ORDER` в
`pipeline/ai-analytics-pipeline.module.ts`) — единственная гарантия того,
что читающий шаг увидит значение писавшего:

| № | Шаг | Ритмы | Читает из шины | Пишет в шину |
|---|---|---|---|---|
| 1 | `calls` | nightly, weekly, monthly, backfill | — | `calls.rows` |
| 2 | `passport` | nightly, weekly, monthly, backfill | `calls.rows` (прокси `since`) | `passport` |
| 3 | `stage-history` | nightly, weekly, monthly, backfill | `calls.rows` | `episodes`, `chain`, `stageTheta`, `cycleMedian`, `slaFacts`, `timestampLeak`, `historyMonths` |
| 4 | `kpi` | nightly, monthly, backfill | — | `kpi.months` |
| 5 | `style` | monthly | `calls.rows`, `passport`; жёсткие оси — `StyleCrmLoader` (не из шины) | `style` |
| 6 | `plans` | monthly (тик 1-го числа) | — | `plans` |
| 7 | `finance` | nightly, monthly, backfill | `kpi.months`, `calls.rows`, `passport`, `plans`, `style`, `chain` | `finance.result` (читателя нет, `@deprecated`) |
| 8 | `rop-mark` | weekly | `calls.rows` | — |
| 9 | `sanity` | weekly, monthly | `calls.rows`, `slaFacts`, `timestampLeak` (месячные снапшоты — через стор) | `sanity` |
| 10 | `portal-model` | monthly, backfill | `calls.rows`, `chain`, `stageTheta`, `episodes`, `cycleMedian`, `historyMonths`, `passport`, `sanity` | `portalModel` |
| 11 | `forecast` | nightly | `portalModel` (нет в шине — последняя записанная модель), `historyMonths`, `chain`, `calls.rows`, `episodes` | — |

Ритмы по факту констант срезов (`AI_*_RHYTHMS`), порядок внутри ритма —
порядок массива:

- **nightly** — `calls` → `passport` → `stage-history` → `kpi` → `finance` →
  `forecast` (модель портала каждую ночь не пересчитывается, прогноз берёт
  последнюю записанную);
- **weekly** — `calls` → `passport` → `stage-history` → `rop-mark` →
  `sanity` (история стадий нужна панели: `slaFacts` и метки времени пишет
  только она);
- **monthly** — `calls` → `passport` → `stage-history` → `kpi` → `style` →
  `plans` → `finance` → `sanity` → `portal-model` (панель перед моделью:
  её отчёт из шины `sanity` модель встраивает в поле `sanity` того же
  прогона, а модель считается по закрытому месяцу — после финансов);
- **backfill** — `calls` → `passport` → `stage-history` → `kpi` →
  `finance` → `portal-model`: догон месяцев с паспортом из кэша `user.get`
  (без него у догнанных месяцев `tenureBand: null`), без похода в портал
  за планами; модель портала пересчитывается по догнанным месяцам, прогноз
  про сегодняшний остаток месяца в догоне не нужен.

Снимок планов шаг `plans` делает только тиком 1-го числа, поэтому финансы
берут цели из двух источников: шина того же прогона, иначе — записанный
снапшот `ai-analytics-plan` нужного месяца (`steps/finance.plans.ts`). Без
второго источника поле `planSnapshot` месячной записи пустовало бы все дни,
кроме первого.

**Маркер пустой недели.** Неделя без разборов пишется шагом `calls`
записью `manager-week` портального зерна — `managerId: null`, `payload
{empty: true, n: 0, reason: 'week-no-analysis'}` — а строк менеджеров не
получает: без маркера догон истории считал бы такую неделю дырой каждую
ночь и никогда не сходился бы (аудит M3). Читатели рядов `manager-week`
обязаны фильтровать записи по `managerId` — маркер не строка менеджера.

**Жёсткие оси стиля в ночном шаге** (волна C). `StyleStep` берёт CRM-оси
`persistence` / `tempo` / `rhythm` из `StyleCrmLoader` (ядро
`core/ai-analytics-core-pbx.module.ts`) за окно стиля и передаёт их в
`buildManagerStylePayload` вместе с осями разбора. Падение телефонии профиль
не роняет: оси разбора считаются, жёсткие молчат, а в результате шага стоит
причина `style-crm-unavailable` (`AI_STYLE_CRM_UNAVAILABLE_REASON`).
Медиана длительности разговора — `medianDurationByType` по типам
**телефонии** (`style-crm.units.ts`, ключи `BX_VOX_CALL_TYPES`; стратум по
типу разбора — Фаза 3); порог разброса по дням — код реестра
`style_dispersion_min_days` (`styleCrmThresholdsOf(ctx.registry)`); сегменты
месяцев объединяются рядами (`mergeManagerMonths`), а не «медианой медиан».
Кэш загрузчика — секция `style-crm-v2` (`style-crm.cache.ts`: ключ
`…:style-crm-v2:{yyyy-MM}:{usersKey}[:{from}_{to}]`, закрытый месяц 30 дней,
текущий 10 мин, потолок 20 000 строк на сегмент); суффикс `v2` — версия
формы сегмента с рядами длительностей, сегменты прежней формы не читаются.

**Срезы шагов** — отдельные модули (§1.6 п. 2 плана: срез объявляет
собственный `@Module`, корневой модуль фичи не растёт); контроллер есть
только у среза слепой проверки:

| Модуль | Шаги | Что ещё даёт |
|---|---|---|
| `snapshots/ai-analytics-snapshots.module.ts` | `calls`, `kpi`, `style`, `finance` | загрузчики — из ядра |
| `passport/ai-analytics-passport.module.ts` | `passport`, `plans` | `ManagerPassportLoader`, `PlansSnapshotUseCase` |
| `stage-history/ai-analytics-stage-history.module.ts` | `stage-history` | `StageHistoryLoader`, `CallEntityLoader` |
| `rop-mark/ai-analytics-rop-mark.module.ts` | `rop-mark` | `RopMarkUseCase`, стор подбора и контроллер `rop-mark/pick|list|save` |
| `portal-model/ai-analytics-portal-model.module.ts` | `portal-model`, `forecast` | `PortalModelUseCase`, `PortalModelLoader` |

Готовая сборка — `AiAnalyticsPipelineModule.registerPhase2()`: динамический
модуль со всеми срезами в `imports` и всеми одиннадцатью шагами в порядке
массива. Сборка приложения (`ai-analytics.module.ts`) импортирует его вместе
с ядром и срезами ручек; процессор очереди берёт раннер по токену
`AI_ANALYTICS_SNAPSHOT_RUNNER`, а джобу резюме — через `BriefJobUseCase`
(оба `@Optional()`: без подключения джобы отвечают понятной ошибкой, а DI-спека
сборки закрепляет, что в собранном приложении оба есть).

Тесты сборки: `__tests__/pipeline-wiring.spec.ts` (DI каждого среза, коды
шагов уникальны, писатель ключа шины идёт раньше читателя, состав каждого
ритма выведен из констант срезов, `backfill ∋ portal-model`, `nightly ∋
forecast`, `registerPhase2` собирает те же шаги в том же порядке),
`__tests__/ai-analytics-module-di.spec.ts` (DI сборки, семь контроллеров,
массив шагов из 11, белый список глобальных провайдеров, ядро без
`PBXModule`, нет дублей провайдеров), `__tests__/ai-analytics.processor.spec.ts`
(каждый обработчик зовёт свой use-case, ошибка — warn + rethrow),
`__tests__/snapshot-pipeline.service.spec.ts` (сам раннер),
`__tests__/snapshots-module-di.spec.ts` (срез снапшотов); всё — в
`npm run test:di`.

## Слепая проверка «три звонка недели» (Фаза 2, волна 4)

Единственный человеческий бюджет недели по плану §12: система сама
подбирает руководителю **три звонка** — с неуверенным типом, с лучшим
баллом (проверка на подыгрывание метрике) и случайный, — а он ставит
метку: согласен ли с оценкой AI, своя оценка 1–10, разделы рубрики,
почему так и как лучше. Подбор детерминирован зерном
`seedOf(domain, weekKey)`: ночной шаг понедельника и ручка дают один и
тот же набор, повтор ничего не меняет.

> ⚠ **Слепой режим гарантируется только этой ручкой.** Пока по звонку нет
> метки, `aiCallType` и `aiScore` в ответе отсутствуют. Но карточку
> разбора в Битрикс руководитель открыть может и оценку там увидит —
> техническими средствами это не закрывается, это договорённость (текст
> оговорки — `AI_ROP_MARK_BLIND_NOTE`, он же едет в поле `blindNote`
> ответа и в описание DTO). Поэтому у метки есть флаг `blind`: первая
> метка по звонку — слепая, повторная (после того как ручка раскрыла
> оценку) — уже нет.

| Файл | Что даёт |
|---|---|
| `@lib/sales-ai-analytics/model/rop-mark` | `pickRopMarkCalls`, `ropMarkSeed`, `isUncertainCallType`, `ROP_MARK_REASONS` — чистый подбор без DI и Bitrix |
| `constants/ai-rop-mark.const.ts` | тип записи `ai-analytics-rop-mark`, код и ритм шага, лимиты метки, русские подписи причин, `mondayOfIsoWeek`, оговорка о слепоте |
| `store/ai-analytics-rop-mark.store.ts` | подбор недели — запись `ai-analytics-rop-mark` с ключом `YYYY-Www`; метка — запись обратной связи `ai-analytics-feedback` вида `rop_mark` с тем же `activity_id` и `transcription_id`; повтор переводит прошлую запись в `superseded` |
| `steps/rop-mark.step.ts` | шаг конвейера `rop-mark` (ритм `weekly`): кандидаты из шины `calls.rows`, запись подбора; строк нет — `skipped` с причиной, прогон продолжается |
| `domain/use-cases/rop-mark.use-case.ts` | `pick` / `list` / `save`: подбор (идемпотентный, `forceRefresh` пересобирает), список с метками и сохранение метки |
| `domain/presenter/rop-mark.presenter.ts` | слепой режим и периметр: колонки AI — только у звонков с меткой, чужие менеджеры вырезаются |
| `dto/ai-rop-mark-request.dto.ts`, `dto/ai-rop-mark.dto.ts` | запросы и ответы с русскими описаниями (разделены, чтобы файлы остались ≤ 300 строк) |

Ручки (`ai-analytics-rop-mark.controller.ts`, поток 19): `POST
ai-analytics/rop-mark/pick` (подбор, `forceRefresh` пересобирает),
`rop-mark/list` (подбор и метки, без подбора — пустой `calls`),
`rop-mark/save` (метка) — конверты `AiRopMarkWeekResponseDto` /
`AiRopMarkSaveResponseDto`, см. раздел «Ручки Фазы 2».

Права: все три метода — только руководителям (`cup`/`op`/`group`,
`assertLeader` в сценарии; периметр контроллер берёт через `resolveViewer`),
менеджеру 403; звонок вне периметра — 403; звонок вне подбора недели или
подбор, которого ещё нет, — 400 с текстом причины. Суперпользователь
вендора (`isSuperUser`) в `ais` ничего не пишет: `save` и `pick` с
`forceRefresh` — 403; `pick` без сохранённого подбора отдаёт тот же
детерминированный подбор как предпросмотр, не сохраняя его.

Вид `rop_mark` есть в общем словаре `AI_ANALYTICS_FEEDBACK_KINDS`, но
общая ручка `feedback` его не принимает (400): она пропускает только
пользовательские виды `AI_ANALYTICS_USER_FEEDBACK_KINDS`. Метки пишет
только `rop-mark/save` и читает только по ключу недели; в
`feedback/list` они не попадают.

Тесты: `libs/sales-ai-analytics/src/__tests__/rop-mark.spec.ts` (состав
набора, воспроизводимость по зерну, пять менеджеров → три разных, меньше
трёх кандидатов → сколько есть), `__tests__/rop-mark.use-case.spec.ts`
(слепой режим до метки и раскрытие после, замена повторной метки, 403/400,
периметр), `__tests__/rop-mark.step.spec.ts` (ритм, идемпотентность,
штатные пропуски), `__tests__/rop-mark.store.spec.ts` (раскладка по ais,
перевод прошлых записей в `superseded`, разбор чужих форм).

## Фаза 4: прогноз отдела, связь качества с результатом, пул порталов, эффект советов

План — `ai/tasks/ai-sales-analytics-phase4-plan.md` (и основной план §4.4, §4.8, §4.10, §4.11, §10). Математика — `@lib/sales-ai-analytics` (`model/beta-*`, `near-outcome`, `negbin`, `forecast-interval`, `lognormal-check`, `lag-cdf-shrink`, `season-index`, `forecast-backtest*`, `pool*`, `lever-key.util`, `recommendation-effect*`, `readiness-phase4*`), контракт нагрузок снапшотов — `contracts/snapshot.phase4.types.ts`.

**Шаги конвейера (19 в `AI_ANALYTICS_PIPELINE_STEP_ORDER`).** Новые:

| Шаг | Ритмы | Читает | Пишет |
|---|---|---|---|
| `quality-link` | monthly, backfill | шина `episodes`, `historyMonths`, `timestampLeak`; 12 мес. lite-строк звонков (`CallsLoader`), сущности звонков (`CallEntityLoader`), прошлый снапшот (серия гейта), `golden-report` (надёжность формы), модель прошлого месяца (оффсет, `S_ref`) | снапшот `ai-analytics-quality-link`, шина `betaSample`, `qualityLink` |
| `pool` | monthly, backfill | все порталы kpiSales → согласие (`ai_analytics_pool_opt_in` + дата) → последние модель и `quality-link` (только `ais`, без Битрикса) | снапшот `ai-analytics-pool` копией у участника, шина `pool`; не участник — пропуск `not-in-pool` |
| `forecast-log-replay` | monthly, backfill (перед `forecast-backtest`) | модель портала с закрытым месяцем раньше M (`latestModel(domain, M)`), `manager-month` за M и 4 месяца назад, дни закрытия сделок (`ClosedSalesDaysLoader`, кэш sales-finance), шина `episodes`/`chain`/`calls.rows`/`historyMonths`, журнал месяца из `ais` | дни `ai-analytics-forecast-log` закрытого месяца с пометкой `replayed: true`, `meta.source: 'replay'`, факт месяца (как у бэктеста) |
| `forecast-backtest` | monthly, backfill | журналы `forecast-log` 12 мес. (живые и восстановленные), замороженные `manager-month` закрытого месяца | факт месяца в `forecast-log`, снапшот `ai-analytics-forecast-backtest` (+ `replayedMonths`) |
| `recommendation-effect` | monthly, backfill | журнал советов (`recommendation_issued`), «Сделано» и «Не согласен» по объекту `lever:`, рёбра `manager-month` до/после, флаги Гудхарта последних трендов | снапшот `ai-analytics-recommendation-effect` |
| `department-forecast` | nightly (после `forecast`) | шина `forecastDay` (или `ais`), модель портала (φ, чек), 3 замороженных месяца (среднее-3) | снапшот `ai-analytics-forecast-log` (день заменяется, факт сохраняется) |
| `recommendation-log` | nightly (последний) | шина `forecastDay` | служебные записи `recommendation_issued` (один совет — одна запись на менеджера, ключ и месяц) |

Модель портала (`portal-model`) читает шину `qualityLink` и `pool`: при опубликованной связи `betaSource: 'data'` и кривая `p̂(S)` уходят в план дня (`daily-plan-rop.facts.ts`), нормы получают κ̄ пула, таблица лага — усадку к общей при ≥ `lag_cdf_portal_min_n` продаж, медиана цикла — гибрид с прайором, φ — по недельным точкам, сезон и чек — оценкой с усадкой к пулу. Готовность модели и витрины поднимается до `forecast` и `recommendations` функцией `elevateReadiness` по последним снапшотам точности и эффекта и флагам портала `forecast_stage_enabled` / `recommendations_stage_enabled` (коды реестра в `ai_analytics_model_params`, включает разработчик); ступени последовательны.

**Ручки Фазы 4.** `POST ai-analytics/forecast` — прогноз отдела (только руководителям, `@PortalSessionProtected`): режим `shadow` (вилки нет, только прогресс теневых месяцев и итог последней проверки) или `published` (вилка, деньги, сделано, простые прогнозы). `settings/get` отдаёт `hypothesis`, `poolOptIn`, `poolConsentAt`; `settings/save` принимает блок `pool {optIn}` (дата согласия ставится днём портала, повторное включение дату не сдвигает). Советы в строках обзора несут `key`, `done`, `issuedAt`; «Сделано» — `feedback {kind: 'recommendation_done', object: 'lever:{managerId}:{key}'}` (менеджер — по своим советам, руководитель — в периметре; «Не согласен» с объектом `lever:` — по тем же правилам). «Как считаем» получил endpoint `forecast` и секции `qualityLink`, `forecastAccuracy`, `pool` (скрыта после отзыва согласия), `recommendationsEffect`.

**Правила показа (ревью Фазы 4).** Прогноз: `published` требует ещё и режима готовности портала не ниже «прогноза» — режим берётся из кэша `settings/get` (`CachedSettingsReader`, тот же ключ и TTL), иначе `shadow` с причиной `forecast-readiness-below`; `forecast-log-missing` — только когда нет ни проверки, ни журнала месяца; проверка пройдена, а журнала за месяц нет — `published` с `band: null` (фронт: «цифры появятся после ночного расчёта»). Простое правило сравнения ошибки (`maseNaive`, `errorVsLastMonth`) — «по темпу с начала месяца» (в первый рабочий день — факт прошлого месяца), не «как в прошлом месяце». Эффект советов: разница «после − до» по ребру (и доли в «Как считаем») — только при знаменателях «до» и «после» не меньше `n_min_none`; в `recommendationsEffect` отдельно `goodhartFlags` (сигналы) и `goodhartManagers` (менеджеры). Два гейта L5 — разные коды готовности: `recommendations-issued-below-{N}` (закрытых окон) и `recommendations-shares-issued-below-{N}` (выданных для долей). «Сделано» в обзоре прошлого периода считается до «сейчас» (день выдачи — только из периода).

**Guard чтения.** `@PortalSessionProtected()` теперь стоит и на ручках чтения (`overview`, `attention`, `by-type`, `settings/get`, `pulse`, `agenda`, `feedback/list`, `rop-mark/pick|list`, `plan-fact`, `about`, `forecast`); `review` остаётся открытой. Режим прежний — `PORTAL_SESSION_GUARD_MODE` (report по умолчанию).

**Админ-ручки** (`apps/admin`, `SUPER_USER`): `GET admin/ai-analytics/pool-status`, `forecast-backtest` (`?months=`), `recommendation-effect`, `quality-link` — все `?domain=`; сводка `GET admin/ai-analytics/feedback` больше не считает заменённые записи (отдельное поле `superseded`). Пересчёт шагов Фазы 4 — `POST admin/ai-analytics/recompute {domain, rhythm: 'monthly', monthKey, steps: ['quality-link', 'pool', 'forecast-backtest', 'recommendation-effect', 'portal-model']}`.

**Воспроизведение журнала прогноза по истории (`forecast-log-replay`, 19.10.2026 — «прогноз отдела быстрее»).** Ступень «прогноз» (L4) открывается после `forecast_shadow_min_months` закрытых месяцев теневого журнала и пройденного бэктеста; ночной `department-forecast` пишет журнал только вперёд, поэтому шаг восстанавливает его задним числом: для каждого рабочего дня d закрытого месяца M прогноз отдела считается теми же функциями, что ночью (`buildForecastPayload` → `managerPointOf` → `buildForecastLogDay`), только по данным, известным к ночи на d. Файлы: `steps/forecast-log-replay.step.ts` (оркестрация), `forecast-log-replay.facts.ts` (чистые факты), `forecast-log-replay.days.ts` (сборка дней и слияние), `domain/loaders/closed-sales-days.loader.ts`.

- Восстанавливается точно: рабочие дни по календарю; модель портала с закрытым месяцем раньше M (та же точка во времени, что у живого прогноза); продажи к d — сделки с `CLOSEDATE` строго раньше d (тот же отчёт и кэш, что у «Финансов»); открытые эпизоды в ночь на d — из шины `episodes` по `startedAt`/`endedAt`, возраст до d, сцепка с менеджером через `chain`/`calls.rows`, θ — стадийные из модели; факт прошлого месяца (наивная база первого дня); простое среднее трёх замороженных месяцев на день d; факт месяца — как ставит бэктест (`rosterMonthSales`).
- Честная деградация: KPI по дням источник не отдаёт (kpi-report считает сегмент целиком), поэтому темп входной активности на день — темп **прошлого** месяца (`callsDone` / рабочие дни), а без прошлого месяца — средний темп самого M (единственный случай с оглядкой в будущее). Без шины истории стадий (ручной пересчёт одним шагом или история короче 3 мес.) `pipelineExpected` у всех менеджеров — `null` с причиной (`pipelineUnknown = managers`), не ноль. План дня, рычаги, утечки, цель уровня и оценка разборов не восстанавливаются — на журнал отдела они не влияют.
- Правила: только закрытые месяцы (ключ раньше текущего месяца портала, иначе `forecast-replay-month-open`); живые дни ночного журнала неприкосновенны — восстанавливаются лишь дни раньше первого живого (все живые с первого рабочего дня — `forecast-replay-nothing-to-do`); прежние восстановленные дни переписываются; `upsert` журнала месяца, `forceRefresh` переписывает; шаг необязательный (`optional-step-failed` не рвёт прогон); seed — `seedOf(domain, managerId, day, calcVersion)` и `seedOf(domain, day, calcVersion)`, как ночью. `meta.source` журнала сохраняется бэктестом (`withActual`); читатели (`forecastLogOf`) старые дни без пометки читают как живые.
- Бэктест и витрина: `shadowMonths` считает и восстановленные месяцы; `replayedMonths` (месяцев с хотя бы одним восстановленным днём) едет в `ai-analytics-forecast-backtest` → `AiForecastShadowDto.replayedMonths`, `AiAboutForecastAccuracyDto.replayedMonths`, админ-`AiAnalyticsForecastBacktestDto.replayedMonths` (все необязательные/0 у старых записей) — витрина может писать «из них восстановлено по истории: K».
- Порядок действий владельца: 1) `POST admin/ai-analytics/backfill {domain, from, to}` на 24 месяца (ручка ставит джобы ритма `backfill` без белого списка — шаг выполняется на каждый месяц окна после `finance`/`stage-history` и до `forecast-backtest`; модель портала для первых месяцев окна может ещё отсутствовать — такие месяцы пропускаются с `forecast-no-portal-model`, повторный backfill дорисует их); 2) `POST admin/ai-analytics/recompute {domain, rhythm: 'monthly', monthKey: <последний закрытый>, steps: ['forecast-log-replay', 'forecast-backtest']}` — для полного пайплайна в пересчёте добавить `'calls', 'stage-history'` перед ними; 3) `GET admin/ai-analytics/forecast-backtest?domain=` — статус `pass`, `shadowMonths`, `replayedMonths`; 4) при `pass` включить `forecast_stage_enabled` (реестр `ai_analytics_model_params`). Пороги `forecast_shadow_min_months` (9) и `forecast_backtest_min_months` (6) можно снизить настройкой портала — диапазон от 3 до 24.

**Известные ограничения (решения за владельцем).** Ключ портала в пуле — усечённый sha1 домена без соли (по словарю доменов обратим; вариант — HMAC с секретом из env). Выданными считаются все советы прогноза дня, в том числе скрытые на витрине при малом числе разборов. SE β — консервативный множитель d_eff, а не кластер-робастная оценка; наклон калибровки — на той же выборке. Покрытие вилки — по дням (дни внутри месяца коррелированы).

## Переразбор истории текущей версией промпта (этап 1B, 20.10.2026)

План — `ai/tasks/2026-10-19-ai-focus-plan.md`, решение владельца 19.10: старые разборы пилотных сотрудников (gsr — Марина Гончар, alfacentr — Софья Шумихина) пересчитать текущей версией промпта, карточки разборов в Битриксе не трогать, уведомления не слать; попутно получить сравнение старой и новой версии на парах.

**Где живёт.** Воркер — `apps/event-sales/src/call-report`: `CallReportReanalyzeUseCase` (джоба `JobNames.CALL_REPORT_REANALYZE`, очередь `CALL_REPORT`, обработчик в `CallReportProcessor`), общий с test-retest шаг повторного прогона `CallAnalysisRerunService` (расшифровка с таймкодами, паспорт, тип звонка из старой записи, модель портала, расход в колонки ais), записи статуса и отчёта — `CallReportReanalysisReportService`; нормализация записи — та же, что у штатного приёма (`agent-gate/services/agent-analysis-prepare.util.ts`). Админ-ручки — `@lib/sales-ai-analytics` (`admin/controllers/reanalyze.admin.controller.ts`), контракт джобы и ключей — `contracts/reanalysis.types.ts`, отчёт согласия версий — `model/agreement/version-agreement-report.ts`.

**Что делает прогон.** Кандидаты = готовые транскрипции домена за период (даты портала `from..to` включительно, пояс `timeZone`, по умолчанию Europe/Moscow) × сотрудники списка (`userIds`, иначе пилот `allowedUserIds` из настроек конвейера; `null` там — все), у которых АКТИВНАЯ запись `agent-analysis` другой ВЕРСИИ промпта (строка `versions.prompt` ≠ текущей; серии накопленной истории объединены — `AI_ANALYSIS_SERIES_START`) или без версий. Пропуски считаются по причинам: `upToDate` (уже текущая серия — повтор запуска безопасен), `noAnalysis` (разбора не было: короткие/нерелевантные заново не разбираем), `notInRoster`, `noActive`. Для каждого кандидата: новая запись `agent-analysis` (`status: done`, provider/agentName `call-report-reanalyzer`, `app: call-report`, текущие `versions`, `reanalysisOf: <id старой>`, `tokens_count`/`price` по цене портала) с копией `report_item_id`, `activity_id`, `entity_type`, `entity_id`, `user_id` старой записи; старая → `status: superseded` (нагрузка сохраняется). Битрикс не вызывается вовсе.

**Читатели берут активную запись.** Общий хелпер `pickActiveAnalysis` / `activeAnalysisByTranscription` (`@lib/call-lib`, `ai/lib/ai-active-record.util.ts`): `status ≠ superseded`, при нескольких — наибольший числовой id. Применён в выборке аналитики (`CallReportAnalyticsDataService`), `SmartLinkLoader`, идемпотентности приёма, статистике типов, недельном Excel, сверках презентаций/отказов/регламента, ночном ревизоре и контексте раскладки.

**Статус и отчёт.** Запись `call-report-reanalysis-run` (ключ `${from}..${to}`, одна на период, обновляется каждые 10 звонков): `candidates, done, failed, skipped, skippedBy, tokens, price, startedAt, updatedAt, finished, lastError, timeBudgetHit, continuedWith, estimate`. Квота на часть (`quota`, по умолчанию 300) и бюджет 45 минут; остались кандидаты и часть что-то смогла — джоба ставит продолжение сама (та же нагрузка, `part + 1`, jobId `call-report-reanalyze:{domain}:{from}:{to}:{run|dry-run}:part-{n}`). `dryRun` — без модели: кандидаты и оценка стоимости (средние токены/цена по записям `agent-analysis` домена за 30 дней с `tokens_count > 0`; нет таких — честно «оценки нет»). По окончании части — отчёт согласия `ai-analytics-version-agreement` (ключ `${старая серия}->${текущая версия}`, прежний того же ключа — superseded) по всем парам окна «старый разбор — переразбор»: общий `GoldenReport` плюс разбивка по старой версии промпта — пары, ICC(2,1)/(3,1), σ, средний сдвиг «новая − старая» общего балла и оценок разделов. По нему владелец решает, объявлять ли старые серии совместимыми (`PROMPT_SERIES_START`) на других порталах.

**Порядок действий владельца (gsr, alfacentr).**
1. `POST admin/ai-analytics/reanalyze {domain, from, to, dryRun: true}` → `GET admin/ai-analytics/reanalyze-status?domain=&from=&to=` — кандидаты, пропуски по причинам, оценка стоимости.
2. `POST admin/ai-analytics/reanalyze {domain, from, to}` (при необходимости `userIds`, `quota`); следить по `reanalyze-status` до `run.finished: true` (продолжения ставятся сами; `failed` повторяются следующей частью, упорные сбои видны в `lastError`).
3. После окончания — `POST admin/ai-analytics/backfill {domain, from: 'YYYY-MM', to: 'YYYY-MM'}` за месяцы периода (ритм `backfill` идёт с `forceRefresh`) и `POST ai-analytics/cache/reset {domain, scope: 'all'}` в kpi-report-sales, чтобы недели/месяцы и обзор пересобрались по новым разборам.
4. Отчёт согласия — в `reanalyze-status.agreement`: по разбивке `byOldPromptVersion` решить про совместимость серий.

## Сигналы руководителю после решения владельца 19.10.2026 (этап 2, 21.10.2026)

Порядок сигналов везде один: **слабые презентации → слабая доработка → прочие звонки с низкой оценкой → риск последним и только с цитатой**. Флаги `promise` («необоснованное обещание») и `client_negative` («сильный негатив клиента») отменены: у модели не спрашиваются (`CALL_REPORT_ACTIVE_RISK_FLAG_CODES` = conflict / compliance / door_closed, `CALL_REPORT_RETIRED_RISK_FLAG_CODES`), приём разбора их отбрасывает, витрина не показывает даже в старых данных (`provenRiskFlags` из `@lib/sales-ai-analytics`: сигнал риска = действующий флаг с непустой цитатой `riskEvidence`).

- **«Внимание»** (`attention.presenter` → `buildAttention`): новые правила `weak_presentation`, `weak_followup`, `low_score_calls` впереди `no_data` / `discipline` / `next_step_drop` / `plan_gap`, `risk` — последним среди правил Фазы 1 (Фаза 3 после). Факты для правил собирает `domain/assembler/call-quality-facts.assembler.ts` по звонкам слоя качества и кладёт в строку обзора `quality` (`AiManagerQualityFactsDto`: `presentation {n, sections NEEDS/PRESENTATION, weakCallIds}`, `followup {n, objectionsKnown/Unhandled, nextStepSet/NoDate, sections OBJECTIONS/CLOSING, weakCallIds}`, `lowScoreCalls[] {transcriptionId, callType, score 1–10}`, `thresholds`). Средние разделов по отделу считает библиотека по всем строкам периметра. Пороги — реестр со слоем портала (`attentionThresholdsOf(settings)`): `weak_section_score_max` (5, [3; 7]) — средняя раздела не выше; `weak_section_gap` (1, [0,5; 3]) — ниже отдела на столько баллов; `low_score_call_max` (4, [2; 6]) — звонок слабый при общей оценке не выше; n раздела — не меньше `n_min_none`. Пороги едут в строке (`quality.thresholds`), чтобы правила читали кэш теми же числами; строки старого кэша без `quality` сигналов этапа 2 не дают, их риск-звонки с отменёнными видами отбрасываются. Ключ обзора — v6.
- **Повестка понедельника** (`agenda.use-case` → `buildAgenda`): виды `weak_presentation` → `weak_followup` → `low_score` → `risk` → запасные `objection` / `section`; причина и цитата — худший из разделов NEEDS/PRESENTATION у презентации, неотработанное возражение или «следующий шаг без даты» у refine / decision, худший раздел у низкой оценки, доказательство флага у риска. Пороги — те же коды реестра.
- **Пульс** (`pulse-alerts.util`): сигнал = действующий флаг с цитатой (вид — первый по справочнику, цитата — доказательство) либо `urgent`; `AI_ANALYTICS_ALERT_KINDS` = действующие коды + urgent.
- **Три звонка недели** (`rop-mark`): случайный слот сначала смотрит на презентации и доработку с общей оценкой не выше `low_score_call_max`, без них — случайный среди всех (`isPreferredLowScoreCall`).
- Санити-панель и потолки оценивания (`riskFlags.count`) тоже считают только действующие флаги с цитатой; сумма риск-звонков в пакете резюме — только действующие виды.

## Тип «Приглашение на мероприятие» (этап 3, 21.10.2026)

Решение владельца 19.10.2026: звонки-приглашения на мероприятие (Всероссийский
юридический форум, онлайн-семинары, вебинары, конференции, собственные онлайн /
офлайн мероприятия портала) — отдельный AI-тип `event_invite` («Приглашение на
мероприятие», карта `AI_ANALYTICS_EVENT_KINDS`), а не `call` / `other` /
`presentation` с оценкой по чужой рубрике.

- **Отдельная колонка, вне средней оценки.** У типа `bucket: null` и новый
  признак карты `column: true` (`AiAnalyticsEventKind.column`, в DTO —
  `settings.callTypes[].column`). Колонка матрицы и подвкладка by-type со своим
  `n`, своей оценкой и KPI-фактом есть (ячейка `byType`, итог `totals`), но тип
  не входит в корзины (`buckets`), среднюю менеджера (`keyMetric`) и отдела,
  нормы, план дня, советы и тренды корзин. Доля «прочее» (`meta.otherSharePct`)
  считается по типам **без колонки** (`column: false` — `other` / `irrelevant`,
  плюс неизвестные коды): в библиотеке это `hasTypeColumn` (`model/buckets.ts`)
  и счётчик `noColumn` матрицы; `noBucket` по-прежнему считает все типы без
  корзины. Фронт помечает колонку подсказкой «Не входит в среднюю оценку;
  считается отдельно» (звёздочка в шапке и у чипа, пометка в CSV и у итогов).
- **KPI-факт** — item `seminar` («Приглашение на семинар») списка `sales_kpi`:
  `kpiEventTypeCodes: ['seminar']`, `kpiPrimaryEventTypeCode: 'seminar'`;
  `seminar` убран из `AI_ANALYTICS_UNMAPPED_KPI_EVENT_TYPES`. Приора по стадии
  сделки нет: пригласить на форум можно с любой стадии.
- **Разбор (event-sales).** Профиль `CALL_REPORT_TYPE_PROFILES.event_invite`
  (CLOSING 100, GREETING 80, OBJECTIONS 70, NEEDS 60, REFUSAL 50, PRESENTATION
  30, PRICE 10; речь 40–60 %, 3–8 вопросов), kind базы знаний
  `call-analysis-event-invite`, блок промпта `EVENT_INVITE_CALL_BLOCK` (польза
  мероприятия для специалиста, квалификация интереса, регистрация или
  договорённость с датой, дверь к продукту после мероприятия; хвост / 5К —
  null). Классификатор знает код (`DEFAULT_CLASSIFICATION_SYSTEM_PROMPT`), синтез
  может уточнить тип в `callTypeRefined`. Версии: промпт `focus-v2.6-2026-10-21`
  и классификатор `2026-10-21` — минорные, записаны в серии
  (`PROMPT_SERIES_START`, `VERSION_FIELD_SERIES_START.classifier`), ряд
  сравнимости не рвётся.
- **Свои мероприятия портала.** Названия, даты и формат своих мероприятий и
  сценарий звонка-приглашения портал кладёт документом базы знаний kind
  `call-analysis-event-invite` (клиентский документ дополняет общий; редактор
  материалов в админке показывает kind человеческим названием «Анализ:
  приглашение на мероприятие»). Критерии определения типа при необходимости
  переопределяются документом kind `call-classify`.
- **После выкладки** на каждом портале один раз выполнить
  `POST call-report/install-smart`: он дольёт значение `event_invite` в enum-поле
  CALL_TYPE смарта «AI-анализ звонков» (`enumItemsAdded`). До этого writer пишет
  элемент без CALL_TYPE с предупреждением в логе, разбор и витрина работают.
  Кэш витрины сбрасывать не обязательно: в старых разборах этого типа нет.

## Проверка

```
npx eslint --fix "apps/kpi-report-sales/src/ai-analytics/**/*.ts"
npx jest apps/kpi-report-sales/src/ai-analytics
npx tsc -p tsconfig.json --noEmit
npm run test:di
```
