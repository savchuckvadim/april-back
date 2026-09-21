# @lib/sales-ai-analytics

Модель AI-аналитики отдела продаж (план `ai/tasks/ai-sales-analytics-plan.md`):
чистые детерминированные функции без DI, Bitrix и БД. Хост-приложение —
`apps/kpi-report-sales` (feature-модуль `ai-analytics`), источник строк —
`CallReportAnalyticsDataService.loadLite` из `@lib/call-lib`.

## Состав

| Файл | Что даёт |
|---|---|
| `model/thresholds.const.ts` | `AI_ANALYTICS_THRESHOLDS` — пороги n, σ XmR, длина серии, z90, короткий звонок; с волны C (18.09.2026) значения берутся `registryDefault(...)` из реестра (`n_min_none`, `n_min_ok_score`, `n_min_ok_rate`, `n_min_rating`, `trend_window_calls`, `xmr_sigma`, `xmr_run_length`, `z_compare`, `min_duration_sec_by_type`), проверяется `lib-defaults.spec.ts` |
| `model/wilson.ts` | `wilsonInterval(successes, n, z?)` — интервал доли |
| `model/metric.ts` | `MetricValue`, `confidenceFor`, `rateMetric`, `scoreMetric`, `METRIC_CONFIDENCE_REASONS` |
| `model/xmr.ts` | `xmrLimits(points)` — центр, `±2,66·MR̄`, состояние последней точки |
| `model/workdays.util.ts` | `WorkCalendar`, `parseWorkCalendar`, `toPortalDate`, `isWorkday`, `lastWorkdays`, `previousWorkday` |
| `model/pulse.ts` | `computePulse(rows, options)` — доля «шаг с датой» за окно рабочих дней + XmR по дням |
| `model/agenda.ts` | `buildAgenda(rows)` — 3 звонка РОПу: риск-флаги → спорные возражения → худший раздел |
| `model/morning-digest.ts` | `buildMorningDigest(rows, managerId)` — фразы `alternatives` менеджеру |
| `contracts/versions.types.ts` | `AnalysisVersions`, `comparableFrom` |
| `contracts/feedback.types.ts` | `AI_ANALYTICS_FEEDBACK_TYPE`, `AI_ANALYTICS_FEEDBACK_KINDS`, payload записи `ais` |
| `contracts/snapshot.types.ts` | `SnapshotEnvelope<T>`, нагрузки снапшотов Фазы 2, `SkillSnapshot` |
| `contracts/snapshot-kinds.const.ts` | реестр 10 типов ais-снапшотов: зерно, ключ, ретенция, статусы (Фаза 2) |
| `params/` | реестр параметров модели (~190 кодов, покрытие 84 кодов анкеты Ж), послойный `resolveParam`, `registryDefault`, `paramsVersion` / `nextComparableFrom` (Фаза 2) |
| `model/norms.index.ts` | экспозиция, κ, leave-one-out нормы, апостериоры рёбер, а с волны C — `model/overdispersion.ts` (сверхдисперсия φ квази-Пуассона) и `model/activity-rate.ts` (`forgetWithGaps`, `resolveActivityPhi`, `shrinkActivityRate` — усадка темпа активности с забыванием по разрывам) (Фаза 2) |
| `model/norms-backtest.ts` | rolling-origin бэктест норм для гейта L2: нормы месяцев ≤ t против t+1, нижняя граница 90 %-интервала разности долей (спека `norms-backtest.spec.ts`) (Фаза 2) |
| `model/quality.index.ts` | качество за период, усадка разделов, форма/содержание, надёжность, а с волны C — `scoring-caps` и `applicability` (Фаза 2) |
| `settings/min-duration.resolve.ts` | единая цепочка порога длительности разбираемого звонка: `resolveMinDurationByType` (явный порог по типам → явный скаляр `min_duration_sec` → `fallbackSec` старой админки → дефолт реестра 300), `registryMinDurationSec`, `isMinDurationPortalDefined`, `minDurationByTypeOfSettings`, `minDurationFloorSec`; её читают event-sales, kpi-report-sales и аудит (Фаза 2, решение А.1) |
| `contracts/quality-link.types.ts` | `QualityLink`, `AI_BETA_SOURCES` — режимы связи качества с исходом (Фаза 2) |
| `contracts/ai-brief.contract.ts` | схема, лимиты и стоп-слова AI-резюме (Фаза 2) |
| `settings/` | десять ключей `[kpiSales]`: типы, дефолты из реестра, парсеры, проверка, сдвиг сравнимой истории, контекст реестра (Фаза 2) |
| `model/scoring-caps.ts`, `model/applicability.ts` | потолки оценок и стоп-фразы, применимость «тип × раздел» (Фаза 2) |
| `model/style-*.ts` | профиль стиля менеджера: оси, усадка, подписи вместо ярлыков (Фаза 2) |
| `model/episode*.ts`, `model/stage-theta.ts`, `model/edge-estimand.ts`, `model/timestamp-audit.ts` | эпизоды сделки, сцепка звонков, стадийные θ, трактовка ребра, плацебо-тест меток времени (Фаза 2) |
| `model/{lag-cdf,forecast,capacity,target,ramp,daily-plan}.ts` | лаг F(d), прогноз, потолок полосы, каскад цели, ramp, план дня (Фаза 2) |

Библиотека не объявляет Nest-модулей, кроме `SalesAiAnalyticsAuditModule`/`SalesAiAnalyticsAdminModule` (аудит Фазы 0): провайдеры приложения живут в `apps/kpi-report-sales/src/ai-analytics` (ядро `core/`). Пустой `SalesAiAnalyticsModule` удалён 18.09.2026.

**Подключение (волна C, 18.09.2026).** Пометки «к ручкам пока не подключено» в разделах волн ниже — исторические, оставлены как хроника: с волны C всё перечисленное зовут ночной конвейер `AiAnalyticsPipelineModule.registerPhase2()` (11 шагов) и ручки Фазы 2 (`plan/daily`, `brief`, `manager/style`, `rop-mark/*`, `about`) в kpi-report-sales — см. README модуля `apps/kpi-report-sales/src/ai-analytics/README.md`. Приёмочные спеки библиотеки: `__tests__/phase2-invariants.spec.ts` (каждый строковый код параметра из `model/`, `settings/` и приложения есть в `AI_ANALYTICS_PARAM_CODES`; слова «значимо» нет в текстах пользователю), `__tests__/lib-defaults.spec.ts` (дефолты модели — из реестра, включая `AI_ANALYTICS_THRESHOLDS` и `NORM_HIERARCHY_DEFAULTS.bootRatio` → `kappa_boot_ratio`).

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

## Фаза 2, волна 1: параметры, снапшоты, нормы, качество

Фундамент модели Фазы 2. Всё ниже — чистая математика и контракты: **ни к одной
ручке пока не подключено**, ETL-конвейер и витрина Фазы 2 подключат это позже.
Наружу торчит через корневой `src/index.ts` (барьеры `params/index.ts`,
`model/norms.index.ts`, `model/quality.index.ts`).

### Реестр параметров (`src/params`, план Фазы 2 §2, анкета Ж)

Около 190 дескрипторов `ParamDescriptor` (код, заголовок, слой `scope`,
источник, единица, дефолт, диапазон, фаза, `breaksSeries`, описание
по-русски) собраны `as const satisfies` из тематических файлов
`registry.*.const.ts` — нормы и усадка, стаж, воронка, рёбра (генератор
`e{n}_rate` / `e{n}_prob` / `mu_e{n}` из `AI_EDGE_CODES`), пороги,
определения событий, стиль, экспозиция и ростер, план и capacity, политики,
пул и версии, качество, гейты данных. `AiAnalyticsParamCode` — литеральный
union кодов.

- **Один код = один скаляр.** Составные значения анкеты Ж расщеплены
  (`kappa_edge` → `kappa_edge_early/late`, `stage_sla` → `sla_*_days` …);
  списки и карты кодируются строкой с `kind: 'enum' | 'csv' | 'json'` и
  словарём `enumValues` (`params/registry.enums.const.ts`), проверка —
  `validateParamValue`.
- **Покрытие анкеты Ж (84 кода)** — `registry.mapping.const.ts`:
  `AI_ANALYTICS_ANKETA_CODES` и `AI_ANALYTICS_PARAM_MAPPING` (код анкеты →
  ≥ 1 код реестра); карта на рёбра витрины — `AI_ANALYTICS_EDGE_VIEW_MAP`.
- `resolveParam(code, ctx?, evidence?)` — послойный resolve менеджер → полоса
  стажа → портал → глобальный дефолт; значение вне диапазона, неверного типа
  или не из словаря не проваливается на слой ниже, а откатывается к дефолту с
  `reason` (`out-of-range` | `type-mismatch` | `invalid-value` |
  `unknown-code`). Гибрид считает `w·data + (1 − w)·prior` по `evidence`.
- `registryDefault(code)` / `registryDefault(code, fallback)`,
  `registryRangeOf`, `isRegistryValue` — типизированный доступ библиотеки к
  дефолтам и диапазонам (`lag-cdf.ts`, `readiness.ts` берут числа отсюда).
- `paramsVersion(payload)` / `REGISTRY_VERSION` = `registryVersionOf(params)`
  — sha256 по каноническому JSON расчётно значимых полей дескрипторов
  (дефолт, диапазон, словарь, `breaksSeries`; тексты не входят), поэтому
  версия меняется при смене дефолта. `nextComparableFrom(prev, codes, now)`
  двигает границу сравнимой истории только при смене кода с `breaksSeries`.

Решения владельца зашиты дефолтами реестра, а не ветвлениями кода:
`min_duration_sec_by_type` = 300 (А.1), `hot_client_definition` =
`stage_from:sales_in_progress` из `PBX_DEAL_SALES_BASE_STAGE_CODE` (А.2, без
magic string), `kappa_portal_to_global` = 0 (А.3, пула нет).

### Реестр снапшотов (`contracts/snapshot-kinds.const.ts`, план §5.1–5.2)

10 типов ais-записей (7 новых Фазы 2 плюс переиспользованные `feedback`,
`audit` и канонический `AI_ANALYTICS_SETTINGS_TYPE`), у каждого — зерно
(`manager-week` … `portal-hash`), форма ключа, ретенция и описание по-русски:
`AI_ANALYTICS_SNAPSHOT_DESCRIPTORS`, хелперы `snapshotDescriptor` /
`snapshotGrain` / `snapshotRetention(+Records|Days)`, статусы `done` |
`superseded`. Конверт `SnapshotEnvelope<T>` и нагрузки (`ManagerWeekSnapshot`,
`ManagerMonthSnapshot`, `PortalModelSnapshot`, `EtlRunSnapshot`,
`SkillSnapshotPayload`) — в `contracts/snapshot.types.ts`. Запись/чтение ais —
на стороне приложения (`AiAnalyticsSnapshotStore` в kpi-report-sales).

### Нормы (`model/norms.index.ts`, план §4.2)

- `exposure.ts` — экспозиция менеджер-месяца: календарь, `D_mt`, `D_active`,
  простой против прокси-отсутствия по серии нулевых рабочих дней,
  `excludeFromNorms` по `min_workdays_month`.
- `kappa.ts` — сила усадки: `kleinmanRho`, `kappaFromRho`, регуляризация к пулу
  по log, `layerKappa`; до гейта κ переключается early(100)/late(30) по истории
  портала (порог `lateFromMonths` — параметр, не константа в коде).
- `norms-hierarchy.ts` — leave-one-out норма полоса стажа → портал → глобаль
  (`NormResult` с `layer`, `n`, `w`), `toShrinkPrior` для усадки.
- `edge-rate.ts` — апостериоры рёбер (`edgePosterior`) и интенсивностей
  (`activityPosterior`, забывание λ), разрыв по Ньюкомбу / отношению гамм
  (`edgeGap` → `significant`, `direction`) вместо одновыборочного Уилсона.
- `overdispersion.ts`, `activity-rate.ts` (добор волны A, в барели с волны C) —
  сверхдисперсия φ квази-Пуассона и усадка темпа активности с забыванием по
  разрывам (`forgetWithGaps`, `resolveActivityPhi`, `shrinkActivityRate`);
  `norms-backtest.ts` — rolling-origin бэктест норм (гейт L2).

### Качество за период (`model/quality.index.ts`, план §4.3)

- `quality-period.ts` — S = `weightedScore` / 10, агрегат по корзинам и разделам
  рубрики (в раздел идут только звонки с `relevance > 0`, у каждого своё `n`).
- `section-shrink.ts` — Normal-Normal усадка к норме, `estimateMS` (однофакторная
  ANOVA; `τ̂² ≤ 0` → `m_S = 50`, `source = managers-indistinguishable`).
- `form-content.const.ts` — деление разделов на форму и содержание;
  `PRESENTATION` размечен `mixed` и в `S^form` не входит.
- `reliability.ts` — `sigmaFromRetest`, `icc21`, `spearmanBrown`, `seOfMean`,
  `groupManagers` (группы above/level/below/unknown по 90 %-интервалам, **не**
  рейтинг) и `canOrderPair` (порядок пары только при n ≥ 50 и |Δ| > 2·SE).

## Фаза 2, волна 2: качество → исход, готовность, резюме, настройки

Продолжение фундамента Фазы 2. Всё ниже — по-прежнему чистая математика и
контракты; **к ручкам не подключено ничего, кроме `settings/*`** (их читает
`settings/save` в kpi-report-sales). Экспорт — из корневого `src/index.ts`.

### Связь качества с исходом и рычаги (`model/qav.ts` и соседи, план §4.4, §4.9)

- `contracts/quality-link.types.ts` — `QualityLink` с режимом
  `betaSource: none | hypothesis | data` (`AI_BETA_SOURCES`), точки кривой
  `p̂(S)`, множитель `QualityMultiplier` со шкалой `probability | exp-beta`.
- `model/prng.ts` — детерминированная случайность: `fnv1a`, `seedOf`,
  `mulberry32`, выборки `sampleNormal / Gamma / Beta / Binomial`. `Math.random`
  и `Date.now` в модели запрещены, seed и время приходят параметром.
- `model/quality-curve.ts` — интерполяция `p̂(S)` по логиту и её обращение
  (`probabilityOnCurve`, `scoreForProbability`, `logit`, `expit`).
- `model/qav.ts` — `buildQualityLink`, `qualityMultiplier` (отношение
  вероятностей `p̂(S)/p̂(S_ref)`, а не odds; `exp(β·ΔS)` — только при редком
  исходе и всегда с пометкой `rareOutcomeOnly`), `isoLine`,
  `requiredQualityFor`, `requiredVolumeWithQuality`. В режимах `none` и
  `hypothesis` множитель ровно 1 с `applied: false`, изо-линия — `null`,
  план по объёму не меняется.
- `model/beta-hypothesis.ts` — калькулятор «что если» на гипотезе портала:
  `fitHypothesisBeta` (МНК по логарифмам), `hypothesisRequiredVolume`,
  `hypothesisFan`, `hypothesisVsData`. β гипотезы в рычаги и планы не попадает.
- `model/beta-power.ts` — мощность и гейт β: `betaStandardError`,
  `presentationsForSe`, `betaGateCountdown` (счётчик «до оценки β» показывается
  с первого дня), `betaGatePassed` (SE ≤ 0,07 **и** накрытие 1 наклоном
  калибровки два месячных пересчёта подряд).
- `model/funnel-gap.ts` + `model/funnel-gap-permutation.ts` — разложение разрыва
  по рёбрам пути на апостериорах Beta с фиксированным seed
  (`decomposeFunnelGap`: сумма вкладов равна `expectedGap`, компонента
  `quality` появляется только при `betaSource: 'data'`, утечка скрыта при
  `n < n_min_none`) и перестановочная проверка ложных утечек
  (`permutationLeakRate` — ≤ 5 % на 200 перемешиваниях).
- `model/recommend.ts` — отбор рычагов `AI_LEVERS`
  (`volume | quality | checklist | pipeline | objection`) по критерию
  `LB80(Δ) > 0`, не более `lever_max`, у каждого `basis` и `ruleCode`.
- `model/evidence.ts` — лестница доказательности `E0…E3`
  (`evidenceLevelFor`, `adviceAllowed`, `phraseFor`): на E1 формулировка без
  императива «делай X вместо Y».

### Готовность витрины и ядро AI-резюме (план §4.10, §6)

- `model/readiness.ts` — **единственный источник правил режимов**
  (`kpi-only → calibration → descriptive → norms → hypothesis`),
  `buildReadiness(input, gates)`, гейт `rosterConfirmed` из
  `roster_confirm_required` и `ai_analytics_roster_confirmed_at`,
  `readinessReason`. `readiness.util.ts` в приложении становится тонким
  адаптером (следующая волна).
- `model/readiness-confidence.ts` — правило показа одного числа:
  `confidenceForPeriod` / `metricForPeriod` (период до `comparableFrom` →
  `confidence: none`, `reason: 'version-changed'`; `n < 8` → значение `null`).
- `contracts/ai-brief.contract.ts` — строгая JSON-схема ответа LLM,
  `AI_BRIEF_LIMITS` (140 / 30 слов / 5 буллетов / 4 КБ / 10 фактов),
  стоп-слова `AI_BRIEF_FORBIDDEN` (включая «значимо»), каузальные обороты,
  причины отбраковки и шаблона.
- `model/brief-pack.ts` — сборка и обрезка пакета фактов по приоритету
  «алерты → отклонения → финансы → дисциплина → телефония → качество данных»,
  `packHash` = sha256 канонического JSON (устойчив к перестановке ключей).
- `model/brief-numbers.ts` — **общая** нормализация чисел: presenter и факт-чек
  обязаны печатать и сверять числа одними и теми же функциями, иначе приёмка
  «≥ 95 % буллетов проходят факт-чек» не выполняется на живых ответах.
- `model/brief-factcheck.ts` / `model/brief-template.ts` — разбор и факт-чек
  ответа модели, откат на шаблон при отсутствии ключа LLM, исчерпанной квоте
  или менее чем двух выживших буллетах.

### Настройки портала (`src/settings`, план §3.3)

Разбор десяти ключей `[kpiSales]` — чистые функции с контрактом
«битый JSON → дефолт кода, без исключения»:

| Файл | Что даёт |
|---|---|
| `settings/ai-settings.types.ts` | типы десяти блоков, `AI_SETTINGS_KEYS`, `AI_PORTAL_EVENT_KINDS`, `AI_SETTINGS_LIMITS`; словари (`AI_MANAGER_LEVELS`, `AI_NORM_STRATA`, `AI_INVOICE_NESTINGS`, `AI_HOT_CLIENT_COLORS`) реэкспортируются из реестра, `AI_FUNNEL_EDGE_CODES` = `AI_EDGE_CODES` |
| `settings/ai-settings.defaults.ts` | дефолты блоков **из реестра параметров** (`registryNumber/Text/Range`), `defaultDefinitions`, `defaultTargets`, `hotStageOf` без magic string |
| `settings/ai-settings.parse.ts` | `parseAiLevels / Targets / Absences / ManagerParams / Events / RosterConfirmedAt` + `parseAiModelParams / Definitions / Scoring / Hypothesis` |
| `settings/ai-settings.sanity.ts` | `settingsSanity(input): { blocking, warnings }` — блокирующая проверка значений, диапазоны берутся из `findParam(code).range`, а не литералами |
| `settings/ai-settings.series.ts` | `diffAiSettings`, `nextSettingsComparableFrom`, `comparableFromEvents`, автособытие `settings_break`: признак `breaksSeries` берётся только из реестра — ключ схемы → коды `AI_SETTINGS_KEY_PARAM_CODES`, поле определений → код `AI_DEFINITION_PARAM_CODES`; ручной таблицы «ключ → рвёт» нет |
| `settings/registry-context.builder.ts` | `buildRegistryContext(input): ParamContext` — слои портал → полоса стажа → менеджер, решение человека кладётся поверх оценки модели; слои типизированы кодами реестра, `AI_DEFINITION_PARAM_CODES` — поле определений → код |

## Фаза 2, волна 1 (добор): потолки и стиль, эпизоды, прогноз и план дня

Третий кусок фундамента Фазы 2 — по-прежнему чистая математика без DI, Bitrix и
Prisma: время и seed приходят параметром, `Math.random`/`Date.now` внутри нет.
К ручкам не подключено, экспорт — из корневого `src/index.ts`.

### Потолки, применимость и стиль (план §4.3, документ «профиль стиля» §2.4, 3.1)

- `model/scoring-caps.ts` — правила `ai_analytics_scoring` (готовый тип
  `AiScoringCapRule` из `settings/`): условие вида `nextStep.set = false`
  разбирается детерминированным мини-парсером, при срабатывании балл раздела
  режется до `maxScore` и пишется флаг (вход не мутируется), несработавшие
  правила уходят в `skipped` с причиной. Стоп-фразы (`findStopWords`) только
  **возвращаются списком** и балл не меняют.
- `model/applicability.ts` — таблица «тип звонка × раздел рубрики»: не
  настраивается и не хранится, а выводится из `CALL_REPORT_TYPE_PROFILES`
  по порогу приора (30). «Презентация» в холодном звонке (приор 20)
  неприменима и в знаменатель `n_j` не входит.
- `model/style-*.ts` — профиль стиля менеджера: 8 осей
  (`style-axes.const.ts`), 12 подписей-фактов вместо ярлыков
  (`style-tags.const.ts`), leave-one-out норма коллег и σ_w с оффсетом полосы
  стажа (`style-axis.ts`), апостериор τ на сетке и смесь усадок
  (`style-shrink.ts`), сборка вектора, BH для яруса «похоже», гистерезис и
  не более трёх подписей (`style-profile.ts`). Свои строки менеджера не
  входят ни в норму коллег, ни в разброс.
- `model/reliability-correction.ts` — `correctForReliability`: поправка
  наклона на надёжность оценщика (`β_true = β_obs / r`); если надёжность не
  измерена, величина эффекта **скрывается**, а не делится на догадку.
  Реэкспортируется из `reliability.ts` — публичный вход не менялся.

### Эпизоды сделки (план §4.1–4.2, §4.4, §4.8, §4.11)

- `model/episode.ts` (+ `episode.types.ts`) — история стадий → эпизоды с
  тремя видами конца: продвижение, провал, цензура (открытый эпизод —
  `durationDays = null`). Коды стадий — `PBX_DEAL_SALES_BASE_STAGE_CODE`.
- `model/episode-link.ts` — сцепка звонков с эпизодами: прямой путь по
  сделке, связанная сделка, лид → сделка и запасной путь по компании и
  контакту с уверенностью `high | low | none`; три звонка одного эпизода
  дают **одну** продажу, а не три.
- `model/stage-theta.ts` (+ типы) — стадийные θ Beta-биномиалом с усадкой,
  факты сроков p25/p50/p90 (`stageQuantileOf`) и лаги продаж под `F(d)`.
- `model/edge-estimand.ts` — выбор трактовки ребра: интенсивность ↔
  вероятность с гистерезисом 80/70 по доле сцепленных звонков, инвариант
  «один источник» (`s > n` → `mixed-sources`).
- `model/timestamp-audit.ts` — плацебо-тест меток времени: доля продаж, у
  которых оплата раньше презентации; выше порога — `flagged`.

### Прогноз и план дня (план §4.8–4.9)

- `model/lag-cdf.ts` — `F(d)` как распределение лага **среди проданных**
  (cure-шкала `F(0) = 0 … F(∞) = 1`), Каплан–Мейер по окну, средняя зрелость
  `F̄(D_rem)` и пол `f_min`. Валидатор реестра различает `lag_cdf_F`
  (вся шкала) и безусловную `cif_sale_inf` (`[0,03; 0,3]`).
- `model/forecast.ts` — ожидание от пайплайна по cure-формуле со знаменателем
  `1 − θ·F(age)`, ожидание нового потока через `F̄`, `p50` и потолок
  `G′`. Без истории стадий возвращается `null` с причиной
  `no-stage-history`, а не ноль.
- `model/capacity.ts` — потолок полосы: квантиль дневного темпа (p90) с
  гейтом «≥ 3 менеджера × 3 месяца без proxy», иначе дефолт реестра; плюс
  связующее ограничение и бюджет времени дня.
- `model/target.ts`, `model/ramp.ts` — каскад цели (план → override → цель
  уровня → медиана полосы) с флагами «мечта» и «недостижимо по объёму»;
  ramp по стажу применяется **к цели**, не к норме.
- `model/daily-plan.ts` (+ `daily-plan.types.ts`) — обратная задача плана
  на день: `N_req`, разворот по путям воронки, потолок `plan_day_ceiling`
  (догонять месячный недобор за три дня — не план) и бюджет времени.
- `model/quantile.util.ts` — общий квантиль (тип 7) для `capacity.ts` и
  `stage-theta.ts`: одна формула на библиотеку, реэкспортируется из
  `capacity.ts`.

Источник производственного календаря портала для экспозиции и `day_hours` —
домен `calendar` в `@lib/bitrix` (`bitrix.calendar.settingsGetSafe()`,
деградация без исключения наружу).

### Три звонка недели для слепой проверки (план §12 и §4.11)

`model/rop-mark.ts` — подбор звонков недели, которые руководитель слушает
сам: `pickRopMarkCalls(candidates, { seed, limit = 3 })` берёт один звонок
с неуверенным типом (`uncertain_type`: `other`, `irrelevant`, пустой или
незнакомый код — `isUncertainCallType`), один с лучшим баллом
(`best_score` — это и есть проверка на подыгрывание метрике) и один
случайный (`random`). Правила: **не больше одного звонка на менеджера,
пока есть подходящие кандидаты у других**; кандидатов меньше трёх —
возвращается столько, сколько есть (не ошибка); зерно — только
`ropMarkSeed(domain, weekKey)`, поэтому повтор подбора за ту же неделю
даёт тот же набор, а порядок входных строк на результат не влияет
(кандидаты приводятся к каноническому порядку и дедуплицируются).

Форма записей — в `contracts/feedback.types.ts`: вид `rop_mark` в
`AI_ANALYTICS_FEEDBACK_KINDS`, `AiAnalyticsRopMarkPayload` (метка: `agree`,
`ropScore`, `sections`, `why`, `howTo`, `reason`, `blind`, `weekKey`) и
`AiAnalyticsRopMarkPickPayload` (подбор недели: `weekKey`, `seed`,
`generatedAt`, `calls`). **Слепой режим — свойство ручки приложения, а не
звонка:** библиотека только подбирает и описывает форму, а прятать оценку
AI до сохранения метки умеет ручка `ai-analytics` (см. её README);
карточку разбора в Битрикс руководитель может открыть и увидеть оценку.

### Паспорт менеджера и полосы стажа (Фаза 2, волна 4, план §4.1 и P2-26)

`model/tenure-bands.ts` — полосы стажа `0-6 | 6-18 | 18+` (`AI_TENURE_BANDS`)
и всё, что вокруг них: `parseTenureGates` разбирает код реестра
`tenure_gates` (битое значение → `TENURE_GATES_DEFAULT = { junior: 6,
senior: 18 }`), `tenureMonthsBetween(since, until)` считает стаж в месяцах
(время — параметром, `new Date()` внутри нет), `tenureBandOf` кладёт стаж в
полосу по границам портала (5 мес. → `0-6`, 6 → `6-18`, 18 → `18+`), а
`levelByTenureBand` даёт подсказку уровня, когда руководитель его не
назначал.

Формы паспорта и снимка планов — в `contracts/passport.types.ts`
(реэкспорт из `contracts/snapshot.types.ts`, поэтому доступны из корня
пакета): `ManagerPassport` (`since` + `sinceSource: employment | register |
proxy`, `status: active | probation | absent | left`, `leftAt`, `level`,
`levelSource`, `tenureMonths`, `tenureBand`) и `PlanSnapshot` (цели
менеджеров на месяц, доля выполняющих план, флаг `planIsWish`). Снимок
планов лежит в `ais` отдельным типом `ai-analytics-plan` (зерно
`portal-month`, ключ `YYYY-MM`) — внутрь `manager-month` его класть нельзя:
ночной шаг переписывает месяц каждую ночь и затёр бы цель, снятую 1-го
числа.

### Публичный барель волны 4

`src/index.ts` реэкспортирует `model/tenure-bands` и `model/rop-mark` —
приложению больше не нужны глубокие пути
`@lib/sales-ai-analytics/model/rop-mark`. Реестр параметров, контракты
снапшотов, нормы, качество, стиль, эпизоды, прогноз, план дня, готовность,
резюме и настройки были подключены раньше; глубокие пути `audit/*` и
`params/index` остаются рабочими (их ломать нельзя).

## Тесты

```bash
npx jest libs/sales-ai-analytics
```

## Аудит данных (Фаза 0)

Каталог `src/audit` — чистая логика аудита данных, на которых строится аналитика: покрытие менеджера по месяцам, разборы по ячейкам менеджер × тип × месяц, шум типов, длительности, версии разбора, заполненность полей, глубина ais и рекомендация по порогам. Единый текст «что делает и как читать» — `AI_ANALYTICS_AUDIT_ABOUT` (`audit/ai-analytics-audit.about.ts`): он же уходит в Swagger, README и в поле `about` ответа ручки.

Nest-слой (`src/admin`):

- `SalesAiAnalyticsAuditModule` — сервисный, без контроллеров: `AiAnalyticsAuditService` (расчёт по живой БД через Prisma, снапшот в ais, проверка признака портала) и `AiAnalyticsAuditSnapshotStore`. Импортируется в kpi-report-sales (месячный снапшот по крону).
- `SalesAiAnalyticsProbeModule` — сервисный, без контроллеров: `StageHistoryProbeService` (проба `crm.stagehistory.list` через `PBXService.init(domain)`, инстанс bitrix только внутри метода). Импортируется ТОЛЬКО в `SalesAiAnalyticsAdminModule` — в kpi-report-sales поддерево `PBXModule` не течёт.
- `SalesAiAnalyticsAdminModule` — контроллер `admin/ai-analytics/*`, подключается ТОЛЬКО в apps/admin (JWT + роль SUPER_USER).

| Ручка | Что делает |
|---|---|
| `POST admin/ai-analytics/audit` `{domain, months?, timeZone?, save?}` | считает аудит по живой БД, при `save` пишет снапшот (ais type `ai-analytics-audit`, source admin); 403 без признака портала |
| `GET admin/ai-analytics/audit/latest?domain=` | последний снапшот (ручка или крон), 404 если нет |
| `GET admin/ai-analytics/audit/about?domain=` | самоописание + признак `ai_analytics_audit_enabled` и дата последнего снапшота портала |
| `GET admin/ai-analytics/stage-history/probe?domain=&months=12` | проба истории стадий сделок (вопрос владельцу A6): доступен ли `crm.stagehistory.list`, самая ранняя запись (`earliestAt`), глубина в полных месяцах (`historyMonths`), переходов за окно `months` (1–36, `transitionsInWindow`, `countIsLowerBound` если Bitrix не отдал total), `enough` = доступен и глубина ≥ окна; категория `sales_base` не настроена — проба по всем воронкам; ошибка Bitrix — `available=false` с текстом в `error`, не 500; признаком аудита не ограничена |

Признак портала — ключ `ai_analytics_audit_enabled` приложения kpi-sales (настройки портала в админке); он не зависит от `ai_analytics_enabled`, аудит делается до включения витрины. Крон — 1-го числа 04:10 МСК (`AiAnalyticsAuditScheduler` в kpi-report-sales). CLI на сервере: `npm run audit:ai-analytics -- --domain <домен> [--months 6]`.

Пример вызова с локальной машины (токен суперпользователя из логина админки):

```bash
curl -X POST "$ADMIN_API/api/admin/ai-analytics/audit" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"domain":"april.bitrix24.ru","months":6}'
```
