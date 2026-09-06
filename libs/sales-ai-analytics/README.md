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

## Матрица и Внимание (Фаза 1b, план §4.2–4.3, §4.5, §6.3)

Чистые функции для `overview` / `attention` / `by-type` в kpi-report-sales. Вход матрицы и среза возражений — `AnalyticsCallLiteRow` из `loadLite` (тип импортируется из call-lib только как тип), карта корзин — `AI_ANALYTICS_EVENT_KINDS` из portal-lib.

| Файл | Что даёт |
|---|---|
| `model/shrink.ts` | `shrinkRate({successes, exposure, prior: {mu, kappa}, intervalKind?, z?})` → `{value, w, n, prior, intervalKind, ci90}` — одна усадка `(s + κμ)/(n + κ)` для долей (Beta-биномиал) и интенсивностей (гамма-Пуассон), `w = n/(n + κ)`; `forgetSeries(points, λ = 0,85)` → `{n, s, periods, lambda, latestPeriodKey}` — суммы с забыванием (последний период весит 1, пропуски подавать нулями); `SHRINK_DEFAULTS` |
| `model/gamma.ts` | `gammaInterval(shape, rate, z?)` — 90 %-интервал Gamma-апостериора приближением Уилсона–Хилферти (точно при shape ≥ 2, т. е. при κμ ≥ 2); для долей усадка берёт Уилсон на псевдосчётчиках `s + κμ`, `n + κ` |
| `model/buckets.ts` | `bucketOfCallType`, `callTypesOfBucket`, `isCallTypeCode`, `compareCallTypes` (порядок справочника), `aggregateBucketScores(entries)` → всегда три корзины contact / presentation / closing с `n` и `score: MetricValue` |
| `model/matrix.types.ts` | `MatrixCallRow` (= lite-строка + необязательные `hvostDone` / `fiveKDone`), `ManagerTypeCell`, `TypeTotalsCell`, `ManagerMatrixRow`, `ManagerTypeMatrix`, `MatrixOptions {thresholds?: {shortCallSec}, comparableFrom?, timeZone?}` |
| `model/matrix-cell.ts` | `buildCellCore(rows, nBeforeComparable)` — ядро ячейки: `score` (среднее `weightedScore/10` при n ≥ 8), `scoreSd`, `sections[]` (только relevance > 0, `avgScore` null при n < 8), `checklists` (`nextStepDateRatePct`, `hvostDonePct?`, `fiveKDonePct?` — в процентах, Уилсон 90 %), `evidenceCallIds {best, worst, median}`, `versionsMixed`; `pickEvidence`, `aggregateSections`, `buildChecklists`, `versionsSignature`, `hasScore`, `callScore10` |
| `model/manager-type-matrix.ts` | `buildManagerTypeMatrix(rows, options?)` → `{managers[], totals[], buckets[], analyzed, noBucket, comparableFrom, excluded}`. В слой качества входят строки с разбором, менеджером и типом не короче `shortCallSec`; строки до `comparableFrom` (дата в TZ портала) и без даты считаются в `nBeforeComparable` и в оценки не смешиваются (§5.4); порядок входа не влияет |
| `model/objections.ts` | `buildObjectionsSlice(rows, {shortCallSec?})` → `{byManager[{managerId, n, byCategory[{category, n, calls, handledRatePct, outcomes {continued, converted, disengaged, other}}]}], totals[], n}`; `outcome` читается как есть, неизвестное и null → `other`; категория null → `unknown`; `compareObjectionCategories` |
| `model/explanation-template.ts` | `renderCellExplanation(cell, {teamMedian?, previous?, previousSd?})` → `{text, basis[]}`: «Оценка 6,4/10 (n = 18). Сильно: … Слабо: … Изменение −0,9 (n = 18/22; ±0,5). Команда: медиана … Совет: …»; при none — «мало данных (n = …)»; слово «значимо» запрещено (`EXPLANATION_FORBIDDEN_WORDS`); `sectionTitle` |
| `model/attention.types.ts` | `ATTENTION_SIGNALS` (risk, no_data, discipline, next_step_drop, plan_gap), `AttentionManagerInput`, `AttentionItem {managerId, rank, signal, availableFrom: 1, headline, basis[{code, value, norm?, n, ci90?}], link}`, `AttentionRules`, `ATTENTION_DEFAULT_RULES {maxItems 7, maxPerManager 3, noDataMinN 8, disciplineMinPlan 10, disciplineMinShare 0,5, nextStepMinN 20, planGapRatio 0,5}` |
| `model/attention.rules.ts` | правила Фазы 1 (`riskRule`, `noDataRule`, `disciplineRule`, `nextStepDropRule`, `planGapRule`, `ATTENTION_PHASE1_RULES`) и `isCloser` — «закрывателю» (исходы ≥ норм уровня) `discipline` не ставится |
| `model/attention.ts` | `buildAttention({managers}, rules?)` → `AttentionItem[]`: ≤ 7 карточек, ≤ 3 на менеджера, порядок «сигнал → тяжесть → managerId», `rank` с 1 |
| `model/metric-pct.util.ts` | `toPercentMetric`, `ratePctMetric` — доля → проценты для полей `*Pct` |

Доли в `AttentionManagerInput.nextStepRate` — 0..1 (как в `computePulse`); в чек-листах матрицы и возражениях — проценты. Пороги n — только `AI_ANALYTICS_THRESHOLDS` (при n < 8 ни одного числа).

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
