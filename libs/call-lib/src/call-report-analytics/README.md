# call-report-analytics — отчёты по AI-аналитике звонков

Переносимый модуль отчётов поверх данных, накопленных конвейером
call-report (транскрипции + анализы агента + классификация типов).
**Единая точка входа** во всю отчётную часть концепции AI-аналитики
звонков (см. карту модулей внизу).

## Подключение (одним импортом, в любой app)

```ts
import { CallReportAnalyticsModule } from '@lib/call-lib';

@Module({
    imports: [CallReportAnalyticsModule],
})
export class SomeAppModule {}
```

С импортом приезжают:

- HTTP-endpoints `/call-report/analytics/*` (контроллер регистрируется
  автоматически);
- программный фасад `CallReportAnalyticsService` (экспортируется) — для
  использования из других модулей без HTTP (например, weekly-cron профилей).

Зависимости: только БД (Prisma: `transcriptions`, `ais`) и Redis.
Bitrix и LLM модулю НЕ нужны — отчёты строятся из уже накопленных данных,
ни одного вызова внешних API при построении отчёта нет.

## Endpoints

Все отчётные endpoints принимают один и тот же запрос
(`CallReportAnalyticsQueryDto`):

| Поле | Обяз. | Описание |
|---|---|---|
| `domain` | ✅ | домен портала |
| `from`, `to` | ✅ | период (ISO 8601) по времени звонка (`call_started_at`) |
| `managerId` | — | Bitrix-id менеджера (ответственный сделки) |
| `minDurationSec`, `maxDurationSec` | — | границы длительности звонка |
| `callType` | — | тип звонка (коды CALL_TYPE смарта: cold/call/presentation/decision/payment/other) |
| `saveToHistory` | — | сохранить снапшот отчёта в историю (`ais`, type=`report-<вид>`), default false |
| `useCache` | — | отдать из Redis-кэша, если свежий; false — пересчитать (кэш обновится), default true |

| Endpoint | Что считает |
|---|---|
| `POST /call-report/analytics/summary` | объёмы, типы, менеджеры, результативность, средние оценки, доля следующих шагов |
| `POST /call-report/analytics/speech` | доля речи (+выходы за норму СВОЕГО типа звонка), вопросы, скрипт, оценки 7 разделов |
| `POST /call-report/analytics/objections` | категории возражений и доля отработанных, конкуренты, риск-флаги, категории отказов |
| `POST /call-report/analytics/managers` | рейтинг менеджеров по взвешенной оценке |
| `POST /call-report/analytics/cache/reset` | сброс кэша: `{domain?, report?}`; пустое тело — весь кэш модуля |

Каждый отчёт несёт `meta`: период, эхо фильтров, totalCalls /
filteredCalls / analyzedCalls / skippedNoManager, `fromCache`,
`generatedAt`, `historyId`.

## Слои кэширования (важно не путать)

1. **БД-уровень (первичный, всегда включён)** — обработанный звонок
   никогда не переобрабатывается: идемпотентность конвейера по
   `dedup_key`, идемпотентный push-back агента. Отчёты читают ТОЛЬКО эти
   накопленные данные.
2. **Redis-уровень (этот модуль)** — кэшируется готовый JSON
   агрегированного отчёта (ключ = вид + домен + hash(фильтров), TTL —
   env `CALL_REPORT_ANALYTICS_CACHE_TTL_SEC`, default 3600).
   `useCache=false` пересчитывает агрегаты из БД (дёшево и безопасно) —
   LLM/транскрибация не затрагиваются никогда.

## История отчётов

`saveToHistory=true` пишет снапшот отчёта в `ais`
(type=`report-<вид>`, app=`call-report-analytics`, полный JSON в
`user_result`). Снапшоты — сырьё для трендов «куда движемся»
(динамика больших периодов, гипотезы, прогнозы — раздел 5.6 плана
`ai/tasks/2026-07-23-call-analytics-cost-optimization.md`).

## Принципы

- **Code computes numbers, LLM only explains** — все числа отчётов
  считает код (`CallReportAnalyticsAggregatorService`, чистые функции);
- нормы речи зависят от типа звонка (`CALL_REPORT_TYPE_PROFILES` —
  единый источник правды связки «тип ↔ анализ»);
- ошибки Redis/истории не роняют отчёт (graceful degradation, всё
  логируется через Logger);
- фильтр по менеджеру: строки без сохранённого менеджера (обработаны до
  включения записи `user_id`) отбрасываются, их число — в
  `meta.skippedNoManager`.

## Карта модулей концепции (что где лежит и как переносить)

| Часть | Модуль | Где |
|---|---|---|
| Смарт «AI-анализ звонков» (конфиг/installer/writer) | `CallReportSmartModule` | `libs/call-lib/src/call-report` |
| Профили типов звонков (тип ↔ анализ) | конст `CALL_REPORT_TYPE_PROFILES` | `libs/portal-lib/pbx/pbx-aicall-smart` |
| Транскрибация (Yandex/VibeCode + лимитеры) | `TranscriptionProviderModule` | `libs/call-lib/src/transcription` |
| Классификация + LLM-анализ (RAG, объединённый вызов) | `AiRagModule` | `libs/ai-rag` |
| Хранилище транскрипций/анализов | `TranscriptionStoreModule`, `AiModule` | `libs/call-lib` |
| **Отчёты (этот модуль)** | `CallReportAnalyticsModule` | `libs/call-lib/src/call-report-analytics` |
| Конвейер (cron/queue/pipeline) | `CallReportModule` | `apps/event-sales/src/call-report` |
| Agent API (внешний агент) | `AgentGateModule` | `apps/event-sales/src/agent-gate` |

Всё, что в `libs/*` — переносится в другой app импортом модуля.
App-часть (конвейер и agent-gate) привязана к event-sales только
регистрацией модулей — при переносе скопировать каталоги и добавить
импорты модулей в новый app-модуль (env-переменные перечислены в
`apps/event-sales/.env.example`, блок call-report).
