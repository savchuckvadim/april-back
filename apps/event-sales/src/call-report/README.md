# call-report — конвейер AI-аналитики звонков (контур 1)

Автоматическая обработка звонков отдела продаж: cron-сканер находит
свежие звонки в voximplant, конвейер транскрибирует, классифицирует и
делает первичный LLM-анализ; результаты копятся в БД (`transcriptions`,
`ais`) и служат сырьём для ночного агента (контур 2, `../agent-gate`)
и отчётов (`@lib/call-lib/call-report-analytics`).

## Карта концепции (единая точка входа в документацию)

| Часть | Где | Документация |
|---|---|---|
| **Конвейер (этот модуль)** | `apps/event-sales/src/call-report` | этот README |
| Agent API (ночной агент, контур 2) | `apps/event-sales/src/agent-gate` | `REMOTE_AGENTS_GUIDE.md` |
| Отчёты за период (+кэш, история, weekly-снапшоты) | `@lib/call-lib/call-report-analytics` | README модуля |
| Точка доступа к VibeCode (транскрибация/классификация) | `@lib/vibecode` | README библиотеки |
| LLM-анализ (RAG, объединённый вызов, провайдеры) | `@lib/ai-rag` | README библиотеки |
| Смарт «AI-анализ звонков» + профили типов | `@lib/portal-lib/pbx/pbx-aicall-smart` | комментарии конфига (источник правды) |
| План/аналитика оптимизации (цены, каскад, roadmap) | `ai/tasks/2026-07-23-call-analytics-cost-optimization.md` | документ |

## Поток данных

```
CallReportScheduler (cron 30 мин, Redis-lock)
  └─ CallReportScanUseCase: voximplant.statistic.get → фильтр ОП → dedup_key
       └─ очередь CALL_REPORT, джоб CALL_REPORT_TRANSCRIBE
            └─ CallReportProcessor.handleTranscribe
                 └─ CallReportPipelineUseCase.executeTranscribe:
                      аудио из Bitrix → TranscriptionRouter (Yandex ≥10мин /
                      VibeCode Whisper) → transcriptions (текст, менеджер)
                 └─ ставит джоб CALL_REPORT_ANALYZE
                      └─ CallReportProcessor.handleAnalyze
                           └─ CallReportPipelineUseCase.executeAnalyze:
                                CallClassifyStepService (тип звонка, tier-1,
                                эскалация по confidence) →
                                LlmOrchestrator.analyzeCall (резюме+рекомендации
                                ОДНИМ вызовом) → ais → таймлайн сделки
```

Ночью внешний агент забирает накопленное через Agent API и делает
глубокий 7-секционный анализ (смарт-элемент, таймлайны) — см. гайд
agent-gate.

## Endpoints (тег Swagger «Call Report»)

| Endpoint | Что |
|---|---|
| `POST /call-report/install-smart` | установка смарта на портал (идемпотентна) |
| `POST /call-report/scan` | ручной скан домена (аналог cron-тика) |
| `POST /call-report/analyze` | синхронный анализ: прямой режим (activityId) или подбор последних записей (dealId/userId + limit/maxDurationSec) |

Отчёты — отдельный тег «Call Report Analytics»
(`/call-report/analytics/*`), см. README модуля отчётов.

## Состав модуля

| Файл | Ответственность |
|---|---|
| `cron/call-report.scheduler.ts` | тик: реанимация зависших + скан доменов allowlist |
| `use-cases/call-report-scan.use-case.ts` | поиск свежих звонков, дедуп, постановка в очередь |
| `use-cases/call-report-pipeline.use-case.ts` | две стадии конвейера (transcribe / analyze) |
| `use-cases/call-report-analyze.use-case.ts` | ручной запуск: прямой режим и подбор |
| `queue/call-report.processor.ts` | воркеры стадий, связка TRANSCRIBE→ANALYZE |
| `services/call-classify-step.service.ts` | шаг классификации: инструкция+ключ+эскалация+персист |
| `services/call-classify-instruction.service.ts` | подменная инструкция классификатора (kind `call-classify`) |
| `services/voximplant-calls.service.ts` | обёртка voximplant.statistic.get (non-Injectable, per-domain) |

## Env (см. `apps/event-sales/.env.example`, блок call-report)

Ключевые: `CALL_REPORT_CRON_ENABLED`, `CALL_REPORT_DOMAINS`,
`CALL_REPORT_CONCURRENCY` / `CALL_REPORT_ANALYZE_CONCURRENCY`,
`CALL_REPORT_COMBINED_ANALYSIS`, `CALL_REPORT_CLASSIFY_ENABLED`,
`CALL_REPORT_CLASSIFY_ESCALATION_CONFIDENCE`, лимитеры
`TRANSCRIPTION_*_CONCURRENCY` / `GIGACHAT_CONCURRENCY`,
`GIGACHAT_COMBINED_MAX_CHARS`. VibeCode-ключ — НЕ env, а `vibeKey`
портала в БД (см. README @lib/vibecode).

## Принципы

- **Идемпотентность**: dedup_key; обработанный звонок никогда не
  переобрабатывается (повторный push-back агента возвращает существующее).
- **Мягкие LLM-шаги**: ошибка классификации/анализа не роняет конвейер —
  транскрипт первичен; ошибка транскрибации возвращает звонок дедупу.
- **Code computes numbers**: числовые метрики считает код, LLM объясняет.
- **Подмена без деплоя**: инструкции классификатора и анализа — документы
  базы знаний; приоры типов — `CALL_REPORT_TYPE_PROFILES`.
- **Каскад ярусов**: tier-1 (VibeCode) → tier-2 (GigaChat) → tier-3
  (ночной агент); эскалация по confidence.

## Тип «Приглашение на мероприятие» и свои мероприятия портала (21.10.2026)

Решение владельца 19.10.2026: звонок, цель которого — пригласить или
зарегистрировать клиента на мероприятие (Всероссийский юридический форум,
онлайн-семинар, вебинар, конференция, собственное онлайн / офлайн мероприятие
портала), — отдельный тип `event_invite` («Приглашение на мероприятие», SORT 550
в `CALL_REPORT_CALL_TYPE_ITEMS`). Продукт в таком звонке — повод, не предмет:
рубрика продажи к нему не применяется целиком, разбор идёт по пользе
мероприятия для специалиста, квалификации интереса и договорённости с датой
(профиль `CALL_REPORT_TYPE_PROFILES.event_invite`, блок промпта
`EVENT_INVITE_CALL_BLOCK` в `contracts/call-deep-analysis.contract.ts`,
подключается в `call-focus-analysis.service.ts` как блоки доработки и решения;
хвост / 5К — null). Если по ходу разговора перешли к предметной презентации
продукта под задачи клиента — это `presentation`; мероприятие, упомянутое
мимоходом, тип не меняет (дефолтная инструкция классификатора и подсказка
синтезу в `callTypeRefined`). Приора по стадии сделки у типа нет. В витрине
AI-аналитики это отдельная колонка вне средней оценки с KPI-фактом
«Приглашение на семинар» (`seminar`) — см. README kpi-report-sales/ai-analytics.

**Как портал добавляет свои мероприятия.** Документ базы знаний kind
`call-analysis-event-invite` (общий — для всех, клиентский домена — дополняет):
список мероприятий с названиями, датами и форматом (онлайн / офлайн) и
сценарий звонка-приглашения, принятый на портале. Разбор получает документ как
инструкцию типа и сверяет названное в разговоре мероприятие с ним; реестр
kind'ов (`libs/ai-rag`, `knowledge-kind-registry.ts`) показывает его в
редакторе материалов как «Анализ: приглашение на мероприятие». Если портал
хочет иначе проводить границу типов — документ kind `call-classify` замещает
встроенную инструкцию классификатора целиком.

**После выкладки** на каждом портале один раз выполнить
`POST call-report/install-smart`: установка идемпотентна и дольёт значение
`event_invite` в enum-поле CALL_TYPE смарта «AI-анализ звонков» (ответ несёт
`enumItemsAdded`). До этого writer пропускает CALL_TYPE с предупреждением, сам
элемент и разбор не теряются. Версии: промпт `focus-v2.6-2026-10-21`,
классификатор `2026-10-21` — минорные (серии сравнимости не рвутся).
