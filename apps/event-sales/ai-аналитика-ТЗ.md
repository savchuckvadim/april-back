# AI-аналитика отдела продаж: техническое задание (v2, 06.09.2026)

Документ конкретизирует постановку владельца (`apps/event-sales/ai-аналитика-отчет.md`, не изменяется) до требований FR-xx с критериями приёмки и привязкой к коду. Основание: план `ai/tasks/ai-sales-analytics-plan.md` (ревизия 3, модель v3 — раздел 4; статус по коду — раздел 14) и анкета `ai/tasks/ai-sales-analytics-inputs.md` (84 параметра, решения владельца). Правила проекта: `ai/rules/heavy-endpoint-queue.md`, `app-api-surface.md`, `pbx-typing.md`, `dto-conventions.md`, `test-structure.md`; миграции — только в Laravel-проекте; в `@Injectable` нет `this.bitrix`; **код считает, LLM объясняет**.

---

## 0. Что строим и для кого

Слой «AI-аналитика» поверх отчёта kpi-sales: бэк в `apps/kpi-report-sales/src/ai-analytics` (ручки, кэш, крон, права), чистая математика в `libs/sales-ai-analytics`, фронт — вкладка в `front/apps/kpi-sales` на `@workspace/april-ui`. Факты берутся из уже накопленных разборов звонков (`ais.type = agent-analysis`, `transcriptions`), KPI-списка `sales_kpi`, закрытых сделок `sales_base` и планов руководителя. Ценность доставляется push-ом (алерт РОПу в день звонка, утренний разбор менеджеру, повестка планёрки), вкладка — архив и второй уровень: пульс, «внимание», таблица «менеджер → сигнал + цифра + финансы», разбор по типам звонков и возражениям; позже — нормы из данных, план дня, прогноз, досье, AI-резюме. Пользователи: РОП («вмешаться / кого разбирать / кому объём, кому качество»), менеджер (одно число плана дня и «что сказать иначе»), владелец (включение и аудит данных портала), суперпользователь админки (аудит, пересчёты, стоимость LLM). Фича включается портальным флагом `ai_analytics_enabled` и флагом фронта; каждое число несёт `n`, интервал и долю собственных данных `w`, при `n < 8` числа нет.

---

## 1. Исходная постановка владельца

**Резюме.** Владелец просит: вкладку «AI аналитика» в KPI-отчёте (эффект reactbits, доступна при включении на портале даже в dev-режиме); быстрые ручки; подвкладки по типам событий (холодный выход на ЛПР, звонок, презентация, доработка, возражения, в решении…); на каждый тип — таблицу «сотрудник | показатель | оценка | объяснение за период» со своими показателями и весами; KPI-цифры по типу; продажи (количество, аванс, месячный чек) и «горячего клиента»; модель, дающую по каждому менеджеру план на день по типам звонков и отработку возражений для выхода на план; учёт уровня, личной сезонности и биоритмов; нормы вида «джун: 30 презентаций при 8/10 или 50 при 5/10»; адаптацию к порталам и людям; графики прогресса/деградации; путь «UI попроще → досье»; AI-ручку резюме «взлёт, падение, на кого обратить внимание».

**Что было общим и как конкретизировано.**

| Формулировка владельца | Решение в ТЗ | План |
|---|---|---|
| Вкладка с reactbits, «если включено на портале даже в dev-режиме» | `EReportType.AI`; `APP_FEATURES.aiAnalytics` + `EAccessFeature.AI_TAB` (`front/apps/kpi-sales/modules/app/consts/features.ts`, `shared/access/access.rules.ts`); портальный `ai_analytics_enabled` — из `settings/get`; dev-override `NEXT_PUBLIC_AI_ANALYTICS_FORCE=1` только реальному суперпользователю; reactbits — обёртки `AiTabTitle`/`AiTabAurora` в `packages/april-ui` | §7 |
| «Эндпоинты для быстрого получения данных» | Лёгкие ручки sync с кэшем на домен; тяжёлые (`overview`, `brief`, `dossier`) — очередь `SALES_KPI_REPORT` + WS + Redis, конверт `{status: ready\|queued\|processing\|error, requestKey}` | §6.2, §6.4 |
| Подвкладки по типам событий | Карта алфавитов `AI_ANALYTICS_EVENT_KINDS` (`libs/portal-lib/pbx/pbx-aicall-smart/type/ai-analytics-event-map.const.ts`): `cold`, `site_lead`, `call`, `presentation`, `refine`, `decision`, `payment` (+ `other`/`irrelevant` — доля в `meta`); «возражения» — сквозной срез, не тип | §2.1 |
| Таблица на тип: сотрудник, показатель, оценка, объяснение; свои показатели и веса | Второй уровень «Разбор по типам»: «широкий» и «длинный» (буквально «сотрудник \| показатель \| оценка \| объяснение»); показатели — разделы с relevance ≥ 30 из `CALL_REPORT_TYPE_PROFILES`; вес = фактическая relevance, ручных весов нет; объяснение — шаблон кода, LLM по кнопке | §3, §4.3, §7 |
| «Оценки с весами уже есть — сделать за период» | `S = weightedScore/10`; за период — среднее при `n ≥ 8` по корзинам контакт/презентация/закрытие; 90 %-интервал, `n`, `w`; «значимо» запрещено до Фазы 3 | §2.2, §4.3, §4.11 |
| KPI по типу в цифрах | Per-type факт `done` по item'ам `event_type` списка `sales_kpi` с помесячным кэшем; `kpi[] {code, fact, planCrm, planHead, norm}`; `refine → kpi: null` | §2.1, §9 |
| Продажи: количество, аванс, месячный чек | `dealsCount`, `advanceAmount`, `monthlyAmount`, `expectedContractAmount` из `apps/kpi-report-sales/src/sales-finance` (закрытые сделки по `CLOSEDATE`) — финансовый хвост в каждой строке | §1, §2.2 |
| «Горячий клиент» | Событие `hot` — слово в UI; стадия ≥ `document` — деньги пайплайна; настройка `hot_client_definition` | §2.2, анкета А.2 |
| Модель → решение по менеджеру, план на день по типам звонков | План дня = план руководителя по рабочим дням, AI меняет только приоритет типов по утечке `L_k`; норма, изо-линия, «недостижимо» — диагностика РОПу; одно число менеджеру с потолком 1,5× | §3, §4.9 |
| Уровень, личная сезонность, биоритмы | Уровень назначает РОП (`ai_analytics_levels`); нормы — по **стажу** (0–6 / 6–18 / 18+ мес.); сезон портала — оценка при ≥ 24–36 мес.; личная фаза — EWMA-остаток «менеджер минус отдел без него»; «биоритмы» не моделируются | §4.6, §4.7 |
| «Джун: 30 презентаций при 8/10 или 50 при 5/10» | Связь «качество → исход» **оценивается из данных** на шкале `p̂(S)`; пример — иллюстрация направления, не правило и не прайор; режимы `betaSource: none → hypothesis (калькулятор РОПа) → data` после гейта `SE ≤ 0,07` | §4.4 |
| Разные порталы и менеджеры | Реестр параметров «глобальный дефолт → портал → полоса стажа → менеджер» с усадкой и `w`; ручных норм нет; новый портал — нормы из своих данных после ≥ 3 мес. и ≥ 100 презентаций | §4.1, §4.2, анкета Ж |
| «Мало презентаций, но много закрытий — тоже хорошо» | `funnelShape: presenter\|closer\|balanced` определяется автоматически; утечка по E1 не ставится, если исходы ≥ нормы | §4.5 |
| «Предсказывать, советы на какие KPI и как повлиять» | Рычаги `volume\|quality\|checklist\|pipeline\|objection` с уровнями доказательности E0–E3; советы «что менять» — с E2; прогноз P50 описательно с Фазы 2, P10/P90 после 9–12 мес. shadow | §4.8, §4.10, §10 |
| График прогресса/деградации | Тренд по окнам 30 разборов, EWMA short/long, перестановочная калибровка, разрыв на `comparableFrom` | §4.7, §5.4 |
| «UI попроще, потом досье» | Фаза 1a push → 1b вкладка → 2 нормы/план/резюме → 3 досье → 4 прогноз | §9 |
| AI-ручка резюме | `POST ai-analytics/brief`: пакет фактов ≤ 4 КБ, ≤ 5 буллетов, факт-чек, квота 5/день, учёт токенов | §8 |

---

## 2. Пользователи и решения

| Роль | Решение | Сигнал / экран / канал | Фаза |
|---|---|---|---|
| РОП | Вмешаться ли сегодня | Алерт `promise\|conflict\|compliance\|client_negative\|urgent` с цитатой и ссылкой — уведомление Bitrix в момент разбора; «отработано» — `feedback alert_handled` | 1a — код готов |
| РОП | Что разбирать на планёрке | Повестка: 3 звонка недели + несогласия — push пн 08:30, карточка во вкладке | 1a / 1b экран |
| РОП | Управляемая цифра недели | Пульс: доля звонков с датой следующего шага за 5 рабочих дней, XmR, `byManager` при n ≥ 20 | 1a ручка / 1b экран |
| РОП | На кого смотреть | «Внимание» ≤ 7: `risk`, `no_data`, `discipline`, `next_step_drop`, `plan_gap` | 1b |
| РОП | Кому объём, кому качество; сколько нужно при качестве S | Таблица менеджер × тип, утечка `L_k`; норма, изо-линия, «недостижимо» — только РОПу | 1b / 2 |
| РОП | Растём или падаем; дойдём ли до плана | Тренды и досье; `Y_0 + λ_pipe`, потом P10/P50/P90 | 3; 2 / 4 |
| Менеджер | Что сказать иначе | Утренний разбор 08:00: 1–3 звонка, три фразы `alternatives`, «Не согласен» | 1a — код готов |
| Менеджер | Что делать сегодня | Одно число `D_τ` + приоритет типов | 2 |
| Владелец | Включать ли фичу | Ключи kpi-sales `ai_analytics_enabled`, `_alerts_enabled`, `_digest_enabled`, `_rop_user_ids`, `_calendar` в админке | 1a — код готов |
| Владелец | Готовы ли данные портала | Аудит: `POST admin/ai-analytics/audit`, `GET …/latest`, `GET …/about`, страница в админке, месячный снапшот | 0 — бэк готов, фронт в работе |
| Владелец | Развилки анкеты А | minDurationSec, горячий клиент, пул, политрамка, эксперименты, стоимость AI | 0 |
| Суперпользователь админки | Пересчёт, backfill, ретенция, golden set, стоимость LLM | `SalesAiAnalyticsAdminModule` (сейчас аудит; остальное — Фаза 3) | 0 / 3 |

---

## 3. Границы

**Входит.** Push-контур; вкладка с пульсом, «вниманием», повесткой и таблицей; разбор по типам и возражениям; финансовый хвост; нормы из данных с интервалами; план дня как одно число; описательный прогноз и cure-модель после сцепки со `stagehistory`; тренды и досье; AI-резюме; аудит данных и админ-ручки; флаги портала и фронта; серверные права; калибровка без разметки сверх 3 звонков в неделю.

**Не входит.** «Биоритмы» и многомесячные личные циклы; помесячный прогноз одного менеджера (только отдел на дневном ряду); ручные веса «тип × раздел» и ручные нормы; тайм-коды до сохранения сегментов транскрипции (Фаза 3); автопонижение уровня и рейтинг людей при n < 50; каузальные советы ниже E2; эксперименты в первый год (кроме «фокуса недели»); Excel и `/share`-зеркало в Фазах 1–2; новые таблицы Prisma; замена ручек `/kpi-report/*` и `/call-report/analytics/*`.

---

## 4. Функциональные требования

Формат: что делает → вход/выход → правило (раздел плана) → приёмка → фаза и статус на 06.09.2026.

### 4.1 Push-контур

**FR-01 Алерт РОПу в день звонка.** После записи разбора с `riskFlags ∩ {promise, conflict, compliance, client_negative} ≠ ∅` или `coachingPriority = 'urgent'` — `im.notify.system.add` каждому РОПу: менеджер, тип, вид сигнала, цитата (возражение, иначе `asWas` худшего раздела, ≤ 300 симв.), ссылка на карточку смарта; запись `ais ai-analytics-feedback kind = alert_sent`. Правило §3. Приёмка: один алерт на звонок; без `ai_analytics_alerts_enabled`/`_rop_user_ids` — `skipped`; ошибка не роняет джобу разбора (fail-open); доставка ≤ 10 мин. Фаза 1a — **сделано**: `apps/event-sales/src/call-report/services/call-report-alert.service.ts`, `call-report-alert-message.util.ts`, тесты.

**FR-02 Утренний разбор менеджеру.** Ежедневно 08:00 МСК каждому менеджеру: 1–3 вчерашних звонка с худшим разделом (`relevance > 0`, непустые `alternatives`), «было» и до 3 фраз «как лучше», ссылка; запись `digest_sent` (`object = digest:{day}`). Вход: `loadLite` за вчерашний рабочий день в TZ портала. Правило `libs/sales-ai-analytics/src/model/morning-digest.ts`. Приёмка: в выходной не шлётся; повтор за день не дублирует; детерминированный порядок. Фаза 1a — **сделано** (`push-digest.use-case.ts`, `ai-analytics-push.scheduler.ts` `0 5 * * *` UTC, non-injectable `AiAnalyticsDeliveryService(bitrix)`).

**FR-03 Повестка планёрки.** Понедельник 08:30 МСК РОПам из `ai_analytics_rop_user_ids`: 3 звонка ISO-недели по приоритету риск-флаги → спорные возражения (`handled = false` или `outcome = disengaged`) → худший раздел; не больше одного звонка на менеджера, пока есть другие; пункт «Несогласия недели». Выход: уведомление + `AiAgendaDto {weekKey, items[{transcriptionId, managerId, callType, kind, reason, quote, charOffset, link, score}], disagreements[]}`; запись `agenda_sent`. Правило `model/agenda.ts`. Приёмка: детерминирована; цитата и ссылка в тексте; повтор за неделю — `already-sent`; РОПы не заданы — warn, джоба не ставится. Фаза 1a — **сделано** (ручка `POST ai-analytics/agenda`, кэш до понедельника).

**FR-04 Ручной запуск и идемпотентность.** `POST ai-analytics/push {kind: agenda|digest, date?, recipients?}` выполняет код крона; `recipients` — «отправить себе» без отметок доставки; только руководители. Джобы `SALES_AI_ANALYTICS_PUSH` с `jobId = ai-analytics:push:{kind}:{domain}:{date}`, второй рубеж — записи `*_sent`; уведомления с `TAG` (повтор замещает); сбой одного получателя не мешает остальным, никому не доставлено → `failed`. Фаза 1a — **сделано** (`push.use-case.ts`, `store/ai-analytics-push-log.store.ts`, `queue/ai-analytics.processor.ts`).

### 4.2 Вкладка и таблица

**FR-10 Настройки и готовность.** `POST ai-analytics/settings/get {domain, requesterUserId}` → `{enabled, pipelineEnabled, auditEnabled, alertsEnabled, digestEnabled, readiness, callTypes[], comparableFrom, ropUserIds}`, кэш 300 с. `pipelineEnabled` — разборы за 30 дней; `readiness.mode`: `kpi-only` (разборов нет) / `calibration` (< 3 мес. или < 60 презентаций) / `descriptive`, с `reasons[]`; `comparableFrom` — max дат пяти версий за 120 дней. Вкладка показывает баннер режима человеческим текстом; в `kpi-only` — без оценок. Правило §4.11, §6.2. Фаза 1a — **сделано** (`settings.use-case.ts`, `presenter/readiness.util.ts`); `levels[]`, `targets` — в `settings/save` (1b/2); баннер — 1b.

**FR-11 Пульс.** `POST ai-analytics/pulse` → `{periodDate, window, nextStepDateRate: MetricDto, xmr {center, ucl, lcl, state}, daily[], analyzedCalls, shortCallsSharePct, byManager[], alerts[]}`. Окно — 5 рабочих дней до вчерашнего рабочего дня в TZ портала; доля — по разобранным звонкам ≥ 300 с с `nextStep.set ∧ date`; XmR по дневным долям 25 рабочих дней; `byManager` при n ≥ 20; `alerts` — риск/urgent окна плюс отправленные с `handled`. Правило `model/pulse.ts`, `model/xmr.ts`. Приёмка: окно через праздник; < 3 дней с разборами → `xmr = null`; кэш 1 ч по `endDate`. Фаза 1a — **сделано**; экран — 1b.

**FR-12 «Внимание».** `POST ai-analytics/attention` (sync над overview-кэшем) → `items[] {managerId, rank, signal, availableFrom, headline, basis[{code, value, norm?, n, ci90?}], link}`; ≤ 7 карточек, ≤ 3 на менеджера. Правила Фазы 1: `risk` (алерты недели), `no_data` (n < 8 при звонках в телефонии), `discipline` (< 50 % плана CRM при `n_plan ≥ 10`), `next_step_drop` (n ≥ 20 в обоих окнах, непересекающиеся 90 %-интервалы), `plan_gap`. Правило §3, `model/attention.ts`. Приёмка: на перемешанных данных ≤ 1 карточки сравнения; «закрывателю» нет `leak`/`discipline` по E1; кнопки «полезно / не полезно» пишут feedback. Фаза 1b.

**FR-13 Обзор (матрица менеджер × тип).** `POST ai-analytics/overview {from, to, managerIds?, confirmedOnly?, socketId?, forceRefresh?}` — кэш → очередь → WS `ai-analytics:overview:done|error`; `requestKey = ${from}|${to}|${sortedIds}|${confirmedOnly}`, период ≤ 3 мес., по умолчанию 4 недели. Выход `AiOverviewDto {period, readiness, calcVersion, versions, comparableFrom, managers: AiManagerRowDto[], totals, departmentTotals, meta}`; состав строки и `meta` — план §6.3. Правило §6.2–6.4. Приёмка: итоги = `/call-report/analytics/managers|summary` и `/kpi-report/get` на тех же фильтрах (0 расхождений); повторный клик → `processing`; `ready` < 300 мс; ≤ 60 с/месяц, ≤ 90 с/квартал; закрытые месяцы KPI — из кэша `kpi-month` без Bitrix. Фаза 1b.

**FR-14 Таблица и блоки (UI).** `AiSignalTable` на `RTable`: сотрудник \| сигнал (`ToneBadge`) \| ключевая цифра (`LiquidProgress`) \| корзины \| продажи \| аванс \| месячный чек \| план CRM сделано/запланировано \| «Не согласен»; группировка по `departmentId/groupId`; без футер-рейтинга. Над таблицей: Пульс (`SectionCard surface="glass"`), Внимание (`HintTooltip` с `basis`), Повестка. Правило §7. Приёмка: `none` → бейдж «мало данных (n = …)», `low` → пунктир; вкладка по флагу и dev-override; телеметрия `feedback view` при открытии. Фаза 1b (`widgets/ai-analytics-report/*`, `entities/ai-analytics/*`).

**FR-15 Обратная связь.** `POST ai-analytics/feedback {kind: view|useful|not_useful|disagree|alert_handled, object, managerId?, transcriptionId?, reason?, payload?}` → запись `ais` (`type = ai-analytics-feedback`, `app = provider = ai-analytics`); `POST ai-analytics/feedback/list {from, to, managerId?}` → `items[] + disagreementSharePct`. Менеджер пишет/читает только за себя, руководитель — по периметру. Контракт `libs/sales-ai-analytics/src/contracts/feedback.types.ts`. Приёмка: `kind` только из `AI_ANALYTICS_FEEDBACK_KINDS`; чужой `managerId` менеджеру — 403. Фаза 1a — **сделано**.

### 4.3 Разбор по типам

**FR-20 Карта алфавитов.** `AI_ANALYTICS_EVENT_KINDS` (as const): тип → `title`, `kpiEventTypeCodes[]`, `kpiPrimaryEventTypeCode`, `kpiReason`, `stagePriorCodes[]`, `tone`, `bucket`. Канон: `cold → xo`, `site_lead → site`, `call → call, come_call`, `presentation → presentation_uniq (главный), presentation, presentation_contact_uniq`, `refine → null ('refine-mapped-to-call')`, `decision → call_in_progress`, `payment → call_in_money, ev_success`; `other/irrelevant → bucket null`. Приёмка: exhaustive-тест по `CALL_REPORT_CALL_TYPE_CODES` и `EnumSalesKpiEventType`, согласованность с `call-type-prior.util.ts`. Фаза 1a — **сделано** (`ai-analytics-event-map.spec.ts`).

**FR-21 Срез по типу, два режима.** `POST ai-analytics/by-type {…фильтры overview, callType | 'objections', layout: wide|long}` — sync-срез кэша. «Широкий»: сотрудник \| n \| оценка \| 2–4 показателя типа \| главный KPI (остальные в раскрытии) \| финансовый хвост \| объяснение. «Длинный»: строка на (сотрудник × показатель) — сотрудник \| показатель \| оценка \| объяснение из `sections[].explanation`. UI: drawer `AiTypesDrawer`, `MicroSegmented` Холодный · Сайт · Звонок · Презентация · Доработка · Возражения · Решение · Оплата; персист `UiSettingsBlob.ai.callType`. Приёмка: «длинный» режим воспроизводит форму постановки; при n < 8 — только бейдж. Фаза 1b.

**FR-22 Оценка за период, разделы, чек-листы.** `AiManagerTypeCellDto {callType, n, score, sections[{section, avgScore, n, avgRelevance, gapToLevel?, explanation}], checklists {nextStepDateRatePct, hvostDonePct?, fiveKDonePct?, handledRatePct?}, kpi[], conversionNext?, explanation}`. `S_i = weightedScore_i/10` (у старых разборов `score × 10`); за период — среднее по корзине при n ≥ 8; раздел — только `relevance > 0` с собственным `n_j`; в Фазе 2 — усадка Normal-Normal к норме полосы (`m_S`, дефолт 10). Свои показатели типа — по таблице §2.1 плана (cold — выход на ЛПР и `talkRatio`; presentation — «Хвост», «5К», презентация → КП; refine — `handledRatePct`; decision — OBJECTIONS/PRICE/CLOSING; payment — финансы). Правило §2.2, §4.3. Приёмка: применимость разделов = `CALL_REPORT_TYPE_PROFILES` с relevance ≥ 30 (видна в «Как считаем»); доли — Уилсон 90 %, `ok` при n ≥ 30. Фаза 1b (описательно), 2 (усадка).

**FR-23 Объяснение оценки.** Шаблон кода без слова «значимо»: «Оценка 6,4/10 (n = 18). Сильно: приветствие 8,1 (n = 18). Слабо: цена 4,2 (n = 11). Изменение −0,9 (n = 18/22; ±0,5). Один совет.» с `basis[]` и `evidenceCallIds {best, worst, median}`; `source: template|llm`, LLM по кнопке с факт-чеком чисел. Правило `model/explanation-template.ts`. Приёмка: каждое число объяснения есть в DTO ячейки; без ключа LLM — шаблон. Фаза 1b / 2.

### 4.4 Возражения

**FR-30 Срез возражений.** `AiObjectionsDto.byManager[] {managerId, byCategory[{category, n, handledRatePct, outcomes {continued, converted, disengaged}}]}` по всем типам; UI `AiObjectionsTable` с цитатами в раскрытии. Приёмка: категории = справочник агента; до сцепки со сделкой — уровень E0 (частоты, цитаты), без `E[Δ]`. Фаза 1b.

**FR-31 Рычаг `objection`.** Категория с худшим исходом, где исход — **только из CRM** (продвижение/отказ эпизода по `stagehistory`), `handled` — единственный LLM-вход: `n_obj·(θ_CRM|handled − θ_CRM|unhandled)`; `objections[].outcome` как исход не используется. Правило §4.10. Приёмка: нижняя граница 80 %-интервала `Δ > 0`; согласие `converted` с КП/счётом в 14 дней ≥ 70 % (G3). Фаза 2.

### 4.5 Финансы

**FR-40 Финансовый хвост.** `finance {salesCount, advanceAmount, monthlyAmount, pipelineFromStage {count, monthlyAmount}, hotEvents}` из `ClosedSalesUseCase`/`HotClientsUseCase` (`apps/kpi-report-sales/src/sales-finance/domain/use-cases`), формулы `libs/shared/src/lib/deal-finance`: `advanceAmount = Σ price×qty`, `paidMonths = Σ qty×множитель(24/12/6/3)`, `monthlyAmount = Σ (сумма строки / эффективные месяцы)`. Приёмка: числа равны вкладке «Финансы» на тех же фильтрах; закрытые месяцы — из кэша. Фаза 1b (`domain/loaders/finance.loader.ts`).

**FR-41 Горячий клиент и пайплайн от стадии.** «Горячий» в UI — только событие `hot`; открытые сделки `sales_base` со стадией ≥ порога (по умолчанию `document`) — «пайплайн от стадии X»: `count`, `monthlyAmount`; после Фазы 2 — `λ_pipe` по cure-модели (`pipelineExpected = null` без 3 мес. `stagehistory`). Приёмка: два числа не смешиваются в одной колонке. Фаза 1b / 2.

### 4.6 План дня

**FR-50 План дня менеджеру.** `POST ai-analytics/plan/daily` → `{managerId, target {sales, source: plan|levelTarget|median}, doneSales, pipelineExpected, daysLeft, items[{callType, requiredToday, doneToday, monthPlan, monthDone, cap, priority}], explanation {steps, text}}`. Одно число `D_τ = max(0, (plan_τ − done_τ)/days_left_m)` с потолком `plan_day_ceiling = 1,5 × plan_τ/D_m` и обучающим минимумом; приоритет типов — по `L_k`; надбавка новичку `ramp_volume_boost·(1 − R(τ))` — к цели, не к норме. Правило §4.9. Приёмка: план ≤ потолка (инвариант-тест); `explanation.steps` воспроизводит расчёт. Фаза 2.

**FR-51 Диагностика РОПу.** В `ropOnly`: норма, `normAtRefQuality`, `betaSource`, `bindingConstraint` (первое ребро с `N_k/D_rem > cap`), `unreachable`, `G′_expected` (по медиане апостериорного темпа) и `G′_ceiling` (при cap p90); бюджет времени `Σ N_k·activity_duration_min_k ≤ day_hours·60`; санити цели: ниже медианы факта полосы → «план = пожелание», выше `cap × D` → «недостижимо объёмом». Фаза 2.

**FR-52 Цели и уровни.** Цель `G`: план руководителя (`UF_USR_A_SALES_PLAN_sales_count`, снапшот 1-го числа с 1b) → `target_override` → `target_sales_by_level` → медиана полосы стажа за 3 мес. Уровень `junior|middle|senior` назначает РОП (`ai_analytics_levels`), дефолт по стажу (< 6 мес. → junior, `levelSource: default`); `since = UF_EMPLOYMENT_DATE ?? DATE_REGISTER ?? первое событие` с `sinceSource`; автопонижения нет. Приёмка: `AiSettingsSaveDto` отклоняет чужой `userId` и `since > today`. Фаза 1b (уровни), 2 (цели).

### 4.7 Нормы

**FR-60 Реестр параметров.** `libs/sales-ai-analytics/src/params/registry.const.ts` (as const): `code`, `scope: global|portal|tenure|manager`, `source: estimated|configured|hybrid`, `default`, `range`, `phase`, `estimator/minN/gate`, `prior`, `intervalKind`, `estimand`, `breaksSeries`. `resolve(code, ctx)` снизу вверх; для гибрида `{value, prior, data, w, n, source}`. Настройками бывают только решения людей, оценками — свойства данных. Приёмка: все 84 параметра анкеты Ж; `paramsVersion = sha256(canonicalJson(...))`. Фаза 2.

**FR-61 Усадка и leave-one-out.** Темпы `E[a_mk] = (Ñ/φ + κ_a·μ_lk)/(D̃/φ + κ_a)`, рёбра `E[θ_mk] = (s̃ + κ_k·μ_lk)/(ñ + κ_k)`, `w = ñ/(ñ + κ_k)`, забывание `λ = 0,85`; `μ_pk` — портал без менеджера, `μ_lk` — полоса стажа без него (≥ 3 менеджеров); `κ_слоя = 0,4·median(ñ)`; до пула `kappa_portal_to_global = 0`; Клейнман при ≥ 6 мес. и ≥ 5 менеджерах. Правило §4.2. Приёмка: 4/15 при μ = 0,09, κ = 30 → 0,149, `w = 0,33`; ≥ 85 % ячеек синтетики в 90 %-интервале. Фаза 2 (`model/shrink.ts`).

**FR-62 Экспозиция и рабочие дни.** `D_calendar` из `calendar.settings.get` (ночной импорт; fallback — производственный календарь РФ; `ai_analytics_calendar` — override), `D_mt = fte·|workdays \ absences|`, `D_active`; прокси-отсутствие — серии ≥ 3 нулевых дней; менеджер-месяцы с `daysSource: proxy` или `D < 8` исключаются из оценки μ/κ/cap. Приёмка: тест окна через праздник; «на год X нет праздников» → Telegram. Фаза 1a (`model/workdays.util.ts` — сделано) / 2 (импорт, отсутствия).

**FR-63 Разрыв против нормы и утечка.** Разрыв — двухвыборочный: интервал разности `θ_m − μ_LOO` (Ньюкомб для долей, интервал отношения для интенсивностей) не накрывает ноль **и** `|Δ| ≥ delta_prac` (5 п.п. / 1 балл). Утечка `ΔS_k = (θ_norm,k − E[θ_mk])·N_k·Π_ниже θ` по путям `funnel_edges` (E1 `call_done → presentation_uniq_done`, E2 `→ ev_offer_pres`, E3 `→ ev_invoice_pres`, E3′ `call_done → ev_invoice`, E4 `ev_invoice → dealsCount`, E5 `presentation_uniq → dealsCount`), 2000 сэмплов, `seed = fnv1a(domain|managerId|date|calcVersion)`; ниже порогов 4.11 не показывается. Правило §4.2, §4.5. Приёмка: 4/35 vs 12/130 — разрыва нет; перестановочный тест ≤ 5 % ложных утечек; воспроизводимость по seed. Фаза 2.

### 4.8 Прогноз

**FR-70 Описательный прогноз и cure-модель.** С Фазы 2 во вкладке `P50 = Y_0 + λ_pipe` и наивные базы без интервалов, только отдел/портал; `λ_pipe = Σ_open θ_j·[F(T − t_j) − F(age_j)] / (1 − θ_j·F(age_j))`, `F(d)` — Каплан–Мейер среди проданных (гейт ≥ 30 продаж; до него экспонента с `cycle_median_days = 28`, `w = n/(n + 20)`); новые активности зреют по `F̄(D_rem)`; `pipeline_estimand: cure|cif` фиксируется в реестре. Правило §4.8. Приёмка: `λ_pipe = 0` с `reason` без истории стадий; тест на смеси «купят/не купят». Фаза 2 / 4.

**FR-71 Shadow и гейт L4.** P10/P50/P90 (NegBin + логнормальный чек) считаются ночью в снапшот `ai-analytics-forecast`, не показываются 9–12 мес.; гейт — биномиальный 90 %-интервал покрытия накрывает 0,8, MASE с бутстрап-интервалом < 1 vs naive. Правило §10. Фаза 4.

### 4.9 Досье и тренды

**FR-80 Тренды качества и объёма.** Качество: окна по 30 разборов одного типа, `EWMA_short` (α 0,3) и `EWMA_long` (α 0,1), флаг при `|Δ| > σ_personal` два окна подряд, семейство менеджер × корзина × раздел — циркулярная блочная перестановка (блок 3 окна, FWER 0,1). Объём: XmR (сделано в `model/xmr.ts`) и CUSUM на остатках `/√φ_mk`, `k = 0,5`, `h` под ARL₀ ≈ 170. Правило §4.7. Приёмка: < 1 ложной тревоги/год/менеджер на синтетических нулях; ступенька ×1,3 ≤ 3 окна; линия рвётся на `comparableFrom`. Фаза 3.

**FR-81 Досье.** `POST ai-analytics/dossier` (очередь + WS) → паспорт (уровень, `since`, `sinceSource`, статус), четыре слоя `UserStatTile`, ряды снапшотов `manager-week/month`, изо-линия (РОПу), блок «История» (уровни, feedback, несогласия, `rop_mark`); подсказка уровня «данные говорят middle, назначен junior» по стажу и объёму данных. UI `UserReportSection id="ai"`. Фаза 3.

**FR-82 Версии и сравнимость.** Каждый новый разбор несёт `versions {prompt, rubric, registry, attribution, classifier}` (`apps/event-sales/src/call-report/contracts/call-report-versions.const.ts`: `focus-v2.1-2026-09-05`, `sections-7-v1`, sha1-12 реестра, `2026-08-24`, `2026-09-05`); `comparableFrom = max` дат; смена `calcVersion` помечает старые снапшоты `superseded`, закрытые месяцы не переписываются; смена промпта/рубрики/реестра → LLM test-retest 300 разборов, ICC(2,1) ≥ 0,7. Приёмка: 100 % новых разборов с пятью версиями (раздел `versions` аудита). Фаза 1a — **сделано** (`call-report.processor.ts:249`, `call-report.processor.versions.spec.ts`); test-retest — 2.

### 4.10 AI-резюме

**FR-90 Краткое резюме.** `POST ai-analytics/brief` (очередь + WS, кэш по `sha256(pack)`): evidence pack ≤ 4 КБ, ≤ 10 фактов из кэшей вкладок (пульс, «внимание», разрывы воронки, финансы vs план, пайплайн, план CRM vs факт, телефония, качество данных) → `AiBriefDto {headline ≤ 140, bullets ≤ 5 {text ≤ 30 слов, managerId?, callType?, factRefs[]}, tone, source: llm|template, packHash, generatedAt, promptVersion}`. Порт `AiBriefLlmPort`; провайдер № 1 — `VibeCodeClient.structuredCompletionWithUsage` (пререквизит), прайс → `ais.tokens_count/price`. Факт-чек: каждое число в пакете, каждый `factRef` существует, < 2 буллетов — шаблон; квота `ai-analytics:brief-quota:{domain}:{date}` ≤ 5. Правило §8. Приёмка: ≥ 95 % буллетов проходят факт-чек на 20 прогонах; без ключа — шаблон; каузальных формулировок и стоп-слов нет. Фаза 2.

### 4.11 Аудит данных и админка

**FR-100 Аудит по живой БД.** `libs/sales-ai-analytics/src/audit/*` (только Prisma `transcriptions`/`ais`, без Bitrix, LLM и текстов): покрытие `user_id` по месяцам, разборы по ячейкам менеджер × тип × месяц, доля `other/irrelevant`, длительности p10/p50/p90 и доля коротких (< 300 с), разборы по версиям, заполненность полей (`nextStep.date`, `alternatives`, `objections[].quote`), глубина `ais`, рекомендация по порогам (`AUDIT_RULES`: `cellMinN 8`, `cellShareMinPct 30`, `shortCallSec 300`, `shortShareMaxPct 40`). Выход: markdown (разделы 1–8) + `report`. CLI `npm run audit:ai-analytics -- --domain <домен> [--months 6]`. Приёмка: отчёт по референсному порталу сохранён в `ai/tasks/ai-analytics-audit-<домен>-<дата>.md` и согласован владельцем. Фаза 0 — **код сделан, приёмка открыта**.

**FR-101 Админ-ручки и самоописание.** `POST admin/ai-analytics/audit {domain, months? (1–24), timeZone?, save?}` — синхронно, снапшот в `ais` (`type = ai-analytics-audit`, `source = admin`), 403 без признака портала; `GET …/latest?domain=` — последний снапшот за 400 дней (404 если нет); `GET …/about?domain=` — `AI_ANALYTICS_AUDIT_ABOUT` (единый текст для Swagger, README и ответа: назначение, источники, границы, показатели, разделы и как читать, правило рекомендации, хранение, доступ, запуск) + `{auditEnabled, lastSnapshotAt}`. Только JWT + `SUPER_USER`; контроллер в `SalesAiAnalyticsAdminModule`, подключён **только** в `apps/admin/src/admin-app.module.ts`. Фаза 3 добавляет `recompute(snapshotId)`, backfill, etl-status, golden-set, retention, сводку feedback и стоимости. Фаза 0 — **сделано** (`libs/sales-ai-analytics/src/admin/*`, `audit/ai-analytics-audit.about.ts`).

**FR-102 Месячный снапшот.** Крон 1-го числа 04:10 МСК (`AiAnalyticsAuditScheduler`) по порталам с `ai_analytics_audit_enabled` → `SALES_AI_ANALYTICS_SNAPSHOT {kind: audit}`, `jobId = ai-analytics:snapshot:audit:{domain}:{YYYY-MM}` → `AuditSnapshotUseCase` → снапшот `source = cron`. Приёмка: без признака портал пропускается; повторный тик не дублирует. Фаза 0 — **сделано**.

**FR-103 Страница аудита в админке фронта.** `front/apps/admin`: выбор портала, запуск с `months`, ожидание (таймаут 180 с), вкладки «Отчёт» (markdown-lite), «Показатели» (`about.computes`), «Как читать» (`resultSections`), «Последний снапшот» с датой и источником; 403 — подсказка включить признак. Entity `modules/entities/ai-analytics-audit/*` с ручными типами до перегенерации `@workspace/nest-admin-api`. Приёмка: после `pnpm generate` ручные типы заменены алиасами generated; страница в меню порталов. Фаза 0 — **в работе** (entity готов, page/widget нет).

### 4.12 Настройки и флаги

**FR-110 Портальные ключи kpi-sales.** `libs/portal-lib/store/app-settings/portal-app-settings.schema.ts` (`[EnumPortalAppCode.kpiSales]`, только `boolean|number|string`, JSON — строкой): `ai_analytics_enabled`, `ai_analytics_audit_enabled` (независим от витрины), `ai_analytics_alerts_enabled`, `ai_analytics_digest_enabled`, `ai_analytics_rop_user_ids` (CSV, `parseUserIds`), `ai_analytics_calendar` (JSON `{timeZone, holidays[], workweek[]}`, битый → Europe/Moscow, пн–пт). Фаза 2: `_levels`, `_targets`, `_absences`, `_model_params`, `_manager_params`, `_definitions`, `_events` с `AiSettingsSaveDto`. Приёмка: тест `__tests__/portal-app-settings.schema.kpi-sales.spec.ts`; выключено → вкладка скрыта, кроны портал пропускают. Фаза 1a — **сделано**.

**FR-111 Флаг фичи и dev-override во фронте.** `APP_FEATURES.aiAnalytics = false`; `EAccessFeature.AI_TAB / AI_VIEW_ALL / AI_CONFIGURE` по образцу `PLANS_*`: `AI_TAB = (features.aiAnalytics || isDevOverride) && (isSuperUser || headOf !== null || isSelf)`, `AI_CONFIGURE` — `cup|op`; listener `feature/ai-flags/model/ai-flags.listener.ts` на `appActions.setAppData` → `settings/get` → `appActions.setFeatures({aiAnalytics: enabled})`; `isDevOverride = NEXT_PUBLIC_AI_ANALYTICS_FORCE === '1' && isRealSuperUser` (вкладка на gsirk вне фрейма, данные всё равно из ручек). Приёмка: без портального флага вкладки нет; `/share` — скрыта по `selectIsPublic`. Фаза 1b — **не начато**.

**FR-112 Форма настроек, карточка менеджера, `breaksSeries`.** Анкета Г: блоки A включение, B календарь, C определения (`productiveCall`, `presentationCanon`, `hotClient`, `minDurationSecByType`), D уровни и цели, E SLA, F потолки/стоп-слова, G алерты/внимание, H продукт и пул, I журнал событий, J «Как считаем» (read-only); карточка менеджера — паспорт (авто, РОП подтверждает), планы, отсутствия, исключения, доставка. `POST ai-analytics/settings/save` — `cup|op`, сбрасывает `overview|attention|model`. Поля с `breaksSeries: true` (`presentationCanon`, `productiveCall`, `invoice_nesting`, `minDurationSecByType`, `applicability`, `caps`) сдвигают `comparableFrom` с диалогом; история — снапшот `ai-analytics-settings-audit`. Фаза 1b (уровни, РОПы) / 2.

### 4.13 Права

**FR-120 `requesterUserId` и периметр.** `AiRequestBaseDto {domain, requesterUserId}` во всех ручках; `RequesterAccessService.resolve` по `BxDepartmentStructureService.getStructure(domain, sales, userId).currentUser.visibility`: `all → cup`, `department → op`, `group → group`, `own → manager`; кэш 5 мин, ошибка структуры — fail-closed. Пульс и повестка считаются на домен, периметр применяется presenter'ом (`applyPulsePerimeter`, `applyAgendaPerimeter`); строки без менеджера видны только тем, кто видит всех. Приёмка: менеджер не видит чужих строк ни одной ручкой. Фаза 1a — **сделано** (`domain/access/*`).

**FR-121 Мутации и роли.** `feedback` за чужого → 403; `feedback/list` без `managerId` — руководители; `cache/reset` и `settings/save` — `cup|op`; `push` — руководители; Фаза 3 — мутации под `@lib/auth`. `requesterUserId` сейчас — поле тела без криптографической привязки; риск подмены до Фазы 3 принимается с политрамкой (открытый вопрос 9.4). Фаза 1a — **сделано**.

---

## 5. Данные и модель

**Единицы анализа.** (1) *Звонок* — `transcriptions` (`done`, `dedup_key`) + `ais.agent-analysis`: разделы, чек-листы, тип, `user_id` (менеджер с 24.08.2026), `entity_type/entity_id`; единица ближнего исхода и push-контура. (2) *Эпизод сделки* — spell `sales_base` между переходами `crm.stagehistory` (Фаза 2, метод в `libs/bitrix` по MCP-документации); убирает двойной счёт «три звонка → одна продажа». (3) *Менеджер-месяц/неделя* — объёмы по типам, рабочие дни, среднее качество, исходы; единица норм. Сцепка звонок → сделка детерминированная (`entity_id`; лид → `to_sale_deal`; xo → `relatedDeals.mainDealId`), fallback по открытой сделке компании с `confidence`; до сцепки рёбра — интенсивности `*_rate`, после — вероятности `*_prob` с гистерезисом 80/70 %.

**Источники.**

| Источник | Что даёт | Где |
|---|---|---|
| Разборы (lite, без текста) | `score`, `nextStep`, `riskFlags`, `coachingPriority`, `sections[]`, `objections[]`, `versions` | `libs/call-lib/src/call-report-analytics/services/call-report-analytics-data.service.ts` `loadLite`, `types/analytics-lite.types.ts` |
| KPI-счётчики | `call_plan/done`, `presentation_*`, `ev_offer_*`, `ev_invoice_*`, `ev_success_done` | `apps/kpi-report-sales/src/report/use-cases/kpi-report.use-case.ts` (помесячный кэш и per-type батч — 1b) |
| Финансы | `dealsCount`, `advanceAmount`, `monthlyAmount`, пайплайн | `apps/kpi-report-sales/src/sales-finance/domain/use-cases/*`, `libs/shared/src/lib/deal-finance` |
| Планы руководителя | цель `G` | `apps/kpi-report-sales/src/plans/domain/plan-targets.service.ts` (экспорт через `plans/index.ts` — 1b) |
| Структура, настройки, профили типов | `headOf`; флаги и календарь; relevance разделов | `libs/bx-department`; `libs/portal-lib/store/app-settings`; `libs/portal-lib/pbx/pbx-aicall-smart` |
| План-факт презентаций | confirmed / reported-only / missed (на лету) | `apps/event-sales/src/call-report/services/presentation-plan-fact.service.ts` (в `libs/call-lib` — Фаза 3) |
| Снапшоты | `ais` (`provider = app = 'ai-analytics'`, `activity_id` = ключ периода) | `libs/call-lib/src/ai`; нужны `findByDomainTypeKeys` и индексы (Фаза 2) |

**Ключевые параметры реестра (из 84, анкета Ж).**

| Код | Смысл | Дефолт | Источник | Фаза |
|---|---|---|---|---|
| `n_min_thresholds` | none < 8; ok оценки ≥ 20; ok доли ≥ 30; рейтинг ≥ 50 | 8 / 20 / 30 / 50 | configured (`AI_ANALYTICS_THRESHOLDS`) | 1a — есть |
| `z_compare`, `control_chart_params` | z 90 %; XmR `2,66·mR̄`, серия 7 | 1,645; 2,66 / 7 | configured | 1a — есть |
| `min_duration_sec` | звонок ниже — вне слоя качества | 300 | configured | 0 — решение А.1 |
| `calibration_gates` | `norms` при ≥ 3 мес. и ≥ 100 презентаций; calibration < 60 | 3 / 100 / 60 | configured | 1a — есть |
| `delta_prac`, `forget_lambda` | практический порог разрыва; забывание месяцев | 5 п.п. / 1 балл; 0,85 | configured | 1b / 2 |
| `kappa_activity_days`, `kappa_edge`, `kappa_layer_ratio` | силы усадки | 20; early 100 / late 30; 0,4 | hybrid → Клейнман | 2 |
| `tenure_bands`, `tenure_gates` | полосы стажа; ворота уровня | 0–6 / 6–18 / 18+; 6 / 18 | configured | 1b / 2 |
| `cycle_median_days`, `f_min` | медиана цикла до `F(d)`; нижняя граница `F̄` | 28; 0,1 | hybrid; configured | 2 |
| `plan_day_ceiling`, `s_req_max`, `cap_level_activity` | потолок плана дня; макс. требуемое качество; p90 темпа | 1,5; 9; cold 40 / call 25 / pres 3 | configured; hybrid | 2 |
| `beta_gate` | показ β «по данным» | `SE ≤ 0,07` + калибровка накрывает 1, два месяца подряд | configured | 4 |
| `dq_gates` | покрытие ≥ 95 %, other ≤ 10 %, κ ≥ 0,6, ICC ≥ 0,7, сцепка ≥ 80 % | политика честности | configured | 0 |

**Калибровочный контур (§4.11).** Еженочно 03:45 TZ портала — календарь, апостериоры с забыванием, EWMA/XmR/CUSUM, эпизоды и `λ_pipe`, план дня, рычаги, подбор 3 звонков недели для `rop_mark`, снапшот `forecast`. Еженедельно пн 03:15 — `manager-week`, окна тренда, перестановочная калибровка, Goodhart-детектор, санити настроек. Ежемесячно 3-го 04:00 — нормы LOO, κ̂, `φ`, `m_S`, `S_ref`, cap, `F(d)`, модель β с гейтом, аудит временных меток, бэктест, readiness. Ежеквартально — пул (≥ 3 порталов с согласием). По событию — смена промпта/рубрики/реестра → test-retest 300 разборов до деплоя. Сейчас реализованы только месячный аудит и push-кроны.

**Честное «мало данных».** `MetricDto {value | null, n, w?, confidence {level: ok|low|none, reason?}, ci90?, trend?, evidence?}` (`libs/sales-ai-analytics/src/model/metric.ts`, `dto/metric.dto.ts`): n < 8 → `none`, `value = null`; 8–19 → `low`; доли `ok` при n ≥ 30; через `comparableFrom` — `none, reason: version-changed`. `ReadinessDto.mode`: `kpi-only → calibration → descriptive → norms → hypothesis → forecast → recommendations`; уровни доказательности E0–E3; рейтинга людей нет — группы «выше / на уровне / ниже».

**Версии.** Пять версий разбора (FR-82); `calcVersion` (`sam-1.0.0`, префикс кэша `sales-ai-analytics:v1`); `paramsVersion`; `inputsHash`; `modelSnapshotId`; `recompute(snapshotId)` воспроизводит числа с `|Δ| ≤ 1e-9`; смена версии не переписывает закрытые месяцы.

---

## 6. Нефункциональные требования

**Производительность.** Лёгкие ручки — sync с кэшем (`AppCacheService`, ключи `sales-ai-analytics:v1:{domain}:{section}:…`): settings 300 с, pulse 1 ч, agenda до понедельника, периметр 5 мин; `ready` < 300 мс. Тяжёлые — `ai/rules/heavy-endpoint-queue.md`: hit → `ready`; miss → `dispatch(QueueNames.SALES_KPI_REPORT, JobNames.SALES_AI_ANALYTICS_*, data, key, {priority: 1, attempts: 1, timeout: 120000})` → `queued`; живая джоба → `processing`; воркер: `pbx.init(domain)` → loaders параллельно → assembler → модель → presenter → write-through → WS; overview ≤ 60 с/месяц, ≤ 90 с/квартал, ≤ 256 МБ; период ≤ 3 мес.; закрытые месяцы KPI — кэш 30 дней, живой хвост 180 с; backfill ≤ 3 мес. за ночь, `callBatchWithConcurrency(1)`; ночные джобы `priority: 10`.

**Кэш и инвалидация.** `settings/save` → `overview`, `attention`, `model`, `plan`; `overview forceRefresh` → `overview:{key}`, `attention`, `by-type`; новый разбор → `pulse`; закрытие месяца → `kpi-month`, `overview`; смена `calcVersion` → bump префикса. `cache/reset {scope}` — SCAN по паттерну, `cup|op`.

**Права и поверхность API.** Серверные права с 1a (FR-120–121); мутации Фазы 3 — `@lib/auth`. Swagger: kpi-report-sales — только тег «Sales AI Analytics»; админ-ручки — только `apps/admin`; event-sales — без новых роутов (`scripts/dump-openapi.ts` до/после, `npm run test:di`).

**Наблюдаемость.** `@lib/metrics` (`ai_analytics_job_duration`, `_rows_loaded`, `_bitrix_calls`, `_llm_price`); Telegram при failed snapshot/brief, не поставленной джобе, превышении бюджета, «на год X нет праздников»; снапшоты `etl-run` (Фаза 2).

**Стоимость LLM.** Резюме и объяснения по кнопке — через порт с `usage`; `ais.tokens_count/price` на 100 % вызовов; квота 5/день/портал, шаблон при исчерпании; test-retest — отдельная квота `retest_budget_calls = 300`; пульс, повестка, дайджест и таблица LLM не вызывают.

**Тесты.** `__tests__` на уровне модуля: чистые функции на синтетике с известными параметрами (Уилсон 4/35 → [5,2 %; 23,2 %], XmR ≤ 1 ложный сигнал на 100 точек), DTO-валидация, controller (403 менеджеру), scheduler (дедуп jobId), processor (rethrow), DI-граф `ai-analytics-module-di.spec.ts`; Фаза 2+ — восстановление θ/β/F/τ_0, покрытие 80 % ± 5, воспроизводимость по seed, инварианты (`w ∈ [0, 1]`, план ≤ потолка, `s ≤ n`). Сейчас ≈ 312 `it(`; `npm run lint` без `any`; `npx tsc --noEmit`.

**Проверка и деплой.** Локально бэки не стартуют без docker (Redis/ClickHouse) — ручки проверяются после пуша: CI `deploy-monorepo.yml` собирает `kpi-report-sales`, `admin`, `event-sales` по paths-filter (`libs/**` → все); orval-клиенты (`front/packages/nest-kpi-report-sales-api`, `nest-admin-api`) регенерирует владелец (`pnpm generate` либо `ORVAL_INPUT` из `scripts/dump-openapi.ts`).

---

## 7. Входные данные и решения владельца (только must)

Полный перечень — анкета, разделы А–Ж. Критический путь:

1. **Решения до приёмки 1a (А).** А.1 короткие звонки: `minDurationSec = 300` или пилот 60 с на одном портале (рекомендация — пилот). А.2 «горячий»: событие `hot` в UI, стадия `document` для денег. А.4 политрамка письменно: агрегаты первым видит РОП, первый квартал без влияния на премии, менеджер видит только себя. А.3 пул — готов ли предлагать пункт договора (`poolOptIn` по умолчанию `false`). А.5 эксперименты выключены, «фокус недели» с квартала 2. А.6 стоимость AI: сегменты транскрипции (Фаза 3), провайдер резюме с usage (Фаза 2), квота test-retest.
2. **Данные и доступы (Б, must).** `crm.stagehistory.list` по `sales_base` и метод в `libs/bitrix` (без него нет эпизодов и `λ_pipe`); индексы `ais(transcription_id)`, `ais(domain, type, activity_id)`, `ais(domain, type, created_at)` — Laravel-миграция к Фазе 2; история продаж WON с товарными строками; признаки базы на момент звонка; `sales_kpi` и телефония на всю глубину; ночной импорт `calendar.settings.get`; лог распределения заявок.
3. **От РОПа ≈ 10 минут (В, Г).** Экран «подтвердите состав и уровни»; 2 эталонных звонка; далее 3 звонка в неделю (`rop_mark`), которые подбирает система. Численных норм и весов у РОПа не спрашиваем.
4. **Подключение портала (Д).** Лестница `PBX_DEAL_SALES_BASE_STAGES` с `refine`, поля договора и базы, `sales_kpi` с dedup-финалами и `presentation_uniq`, voximplant с `PORTAL_USER_ID`, `PortalAiSettings.enabled`, `HEADS` отделов, аудит Фазы 0 согласован, политрамка подписана, статус `calibration` 3 месяца.
5. **Порядок включения.** `ai_analytics_audit_enabled` → аудит → `ai_analytics_enabled` + `_rop_user_ids` → `_alerts_enabled` → `_digest_enabled` (после двух недель «только коучинг»).

---

## 8. Поэтапность и критерии готовности

| Фаза | Объём | Критерий готовности | Оценка | Статус 06.09.2026 |
|---|---|---|---|---|
| 0. Аудит данных | `libs/sales-ai-analytics/src/audit`, CLI, админ-ручки, крон, признак, самоописание, страница в админке | отчёт по референсному порталу в `ai/tasks/ai-analytics-audit-<домен>-<дата>.md`; решение по порогам 4.11 и `minDurationSec`; покрытие ≥ 95 %, `other + irrelevant` ≤ 10 % | 3 дня | бэк сделан; фронт в работе; приёмка владельцем и А.1 открыты |
| 1a. Push-контур | версии, раскол `call-report-analytics`, lib (пульс/повестка/дайджест/XmR/Уилсон), feature-модуль (settings/pulse/agenda/feedback/cache/push), алерты, 6 ключей | повестка пн 08:30 с 3 звонками; алерт ≤ 10 мин; дайджест с `alternatives`; версии в 100 % разборов; Swagger event-sales без новых роутов; `feedback/list` отдаёт несогласия; менеджер не видит чужих | 8 дней | код сделан и покрыт тестами; **не закоммичено, не задеплоено, на портале не проверено** |
| 1b. Вкладка и таблица | KPI-слой с помесячным кэшем и per-type батчем; `shrink`, `manager-type-matrix`, `attention`, `explanation-template`; `overview/attention/by-type/settings/save`; фронт (флаги, listener, entity, виджеты) | 0 расхождений с существующими ручками; при n < 8 ни одного числа; повторный клик — `processing`; overview ≤ 60 с; «длинный» режим воспроизводит постановку; вкладка по флагу; менеджер видит только себя | 14 дней (9 бэк + 5 фронт) | не начато; пререквизит — `pnpm generate` после деплоя |
| 2. Нормы, план дня, резюме, снапшоты | `findByDomainTypeKeys` + индексы, `structuredCompletionWithUsage`, `stagehistory`; ночной конвейер и снапшоты; реестр; LOO-усадка; `plan/daily`; `brief`; форма настроек; test-retest | синтетика ≥ 85 % в 90 %-интервале; ≤ 5 % ложных утечек; ≥ 95 % буллетов проходят факт-чек; план ≤ потолка; `pipelineExpected = null` без стадий | 22 дня | не начато |
| 3. Досье, тренды, реконсиляция, админ | EWMA/перестановки/CUSUM, ramp, plan-fact в `libs/call-lib`, `dossier`, админ-модуль (recompute, backfill, etl-status, golden-set, retention), сегменты → `timecodes` | < 1 ложной тревоги/год/менеджер; ступенька ×1,3 ≤ 3 окна; линия рвётся на `comparableFrom`; golden set ICC ≥ 0,7 | 20 дней | не начато |
| 4. Прогноз и эмпирический β | Клейнман-κ, `F(d)` KM, NegBin, логнормальный чек, иерархический β на пуле, бэктест, readiness | coverage накрывает 0,8; MASE < 1 vs naive; `beta_gate` два месяца подряд; E1 на референсном портале — через 8–10 мес. после старта Фазы 2 | 15 дней + 9–12 мес. shadow | не начато |

Ступени доверия L0–L5 — план §10. До конца Фазы 1b ≈ 17 рабочих дней от 06.09 (закрытие 0 и приёмка 1a ≈ 2–3, 1b ≈ 14).

---

## 9. Открытые вопросы

1. **Приёмка Фазы 0.** Кто и когда прогоняет аудит на референсном портале после деплоя; где фиксируется решение по `minDurationSec` (А.1) и порогам; нужен ли md в `ai/tasks` при снапшоте в `ais`.
2. **Время рассылок.** Кроны `30 5 * * 1` и `0 5 * * *` UTC = 08:30/08:00 МСК для всех порталов; для другой TZ дайджест придёт не в 08:00 локального — переводить на «ежечасный крон + локальный час» в 1b или позже?
3. **Канал доставки.** Уведомления `im.notify.system.add` вместо чата/задачи (`CallReportWeeklyDeliveryService`): оставить или дать выбор канала?
4. **Подмена `requesterUserId`.** До Фазы 3 нет подписи запроса: принять риск с политрамкой или подписывать токеном фрейма уже в 1b?
5. **Типы в UI.** `callTypes` отдаёт 9 кодов, включая `other/irrelevant` и `site_lead`: «Сайт» — отдельная подвкладка или объединить со «Звонком»?
6. **`site/come_call` в `call_done`, вложенность счетов, стадии «в решении».** Фиксируются по аудиту (`invoice_nesting`, `decisionStages` из `order` лестницы); override — только в админке владельца?
7. **Пул порталов (А.3) и пререквизиты Фазы 2.** Без пула E1 через 8–10 мес. (анкета Е); сроки Laravel-миграции индексов `ais` и `stagehistory` в `libs/bitrix` блокируют Фазу 2.
8. **Excel, `/share`, ретенция.** Нужны ли выгрузка и зеркало до Фазы 3; подтвердить сроки ретенции снапшотов (forecast 6 мес., etl-run 90 дней, superseded — 2 версии).

## 10. Изменения 07.09.2026 по решениям владельца

Ответы по анкете (раздел «А-ответы» `ai/tasks/ai-sales-analytics-inputs.md`, план §14.5, §4.6а). Правки к FR:

| FR | Было | Стало |
|---|---|---|
| FR-11, FR-100, §4.3 «Холодный» | порог 300 с как константа lib (`shortCallSec`) | параметр реестра `min_duration_sec_by_type` (portal, configured, default 300, `breaksSeries`), общий для пульса, аудита и конвейера; пилот 60 с на одном портале. Порог только отсекает разбираемые звонки — тип назначает классификатор (холодный может быть длиннее презентации) |
| FR-41 | «горячий» в UI — событие `hot`; пайплайн от стадии `document` | «горячий» = открытая сделка `sales_base` со стадией ≥ «В решении» (`sales_in_progress`); источник — `HotClientsUseCase` вкладки «Финансы» (в `SALES_HOT_THRESHOLDS` добавляется `decision`); параметр `hot_client_definition`; цвет компании — резерв `company_color_field` |
| FR-110/FR-111, §4.13 права | менеджер без `headOf` видит только свои строки; `AI_TAB` включает `isSelf` | витрина только руководителям и суперпользователю: настройка `ai_analytics_self_view_enabled` (default false) → менеджеру 403 на читающих ручках и нет `AI_TAB`; push-контур менеджеру сохраняется |
| §4.7 нормы, §5 пул | пул — по договору | одно-портальный режим — рабочий: `poolOptIn = false`, `kappa_portal_to_global = 0`; тестовые порталы работают 8–10 месяцев до первой оценки β; счётчик «до оценки β» — с первого дня |
| FR-90, §6 стоимость | по рекомендации | принято: VibeCode с usage → `ais.tokens_count/price`; сегменты транскрипции — пилот Фазы 3; test-retest 300 разборов — квота в `ai_analytics_model_params` |
| §5 данные | индексы `ais` — у владельца | миграция написана в проекте online (`2026_09_07_100000_add_ai_analytics_indexes_to_ais_table.php`), `@@index` в `schema.prisma`; применяет владелец |
| новое, FR-113 | — | **Стиль менеджера** (оценка из данных, не настройка): `AiStyleProfileDto {tags[] {code, title, basis[], n}, vector, confidence}` в `AiManagerRowDto.style`, окно ≥ 40 разборов за 3 мес.; теги ≤ 3 из `style-tags.const.ts` по z-оценкам относительно портала (LOO), порог `style_tag_z = 0,8`; используется в карточке, объяснениях и адресации коучинга; в нормы, цели, уровни и рейтинги не входит. Фаза 2 (lib `model/style-profile.ts`) |
