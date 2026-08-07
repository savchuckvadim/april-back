# Sales Hooks — каркас семейства хуков отдела продаж

Как устроено семейство хуков (лид → работа, merge, передача работы, буфер
отказников, нормализатор конвертации) и как добавить новый хук.

## Требования к порталу: pbx-поля и стадии (установка)

Хуки graceful: неустановленное поле/стадия = молчаливый пропуск шага +
warning в результате операции. Полный функционал требует установки ниже.
Источник шаблона полей — `storage/app/install/sales/entity-fields/data.xlsx`
(лист `calling_fields`), константное зеркало —
`libs/portal-lib/pbx-domain` → `pbx-sales-event-field.type.ts`.

### Поля СДЕЛКИ (воронка ОП; ставятся кнопкой установки полей сделки)

| Код | Тип | Кто пишет | Зачем |
|---|---|---|---|
| `deal_from_lead_id` | crm (LEAD) | хук лид→работа, нормализатор | лид-первоисточник БЕЗ конвертации |
| `deal_joined_leads` | crm (LEAD), multiple | лид→работа (union), merge, нормализатор | ВСЕ присоединённые лиды; переживает merge |
| `to_base_sales`, `to_xo_sales`, `to_presentation_sales`, `to_base_tmc`, `to_presentation_tmc` | crm | event-report, лид→работа | связи с сателлитами (давно в шаблоне) |

### Поля ЛИДА (кнопка установки полей лида)

| Код | Тип | Кто пишет | Зачем |
|---|---|---|---|
| `to_base_sales` | crm (DEAL) | лид→работа, нормализатор | обратная ссылка на основную сделку |
| `to_sale_deal` | crm (DEAL) | (резолвер соседа читает) | «с этой заявки прошла продажа» (пара к op_lead_is_boost_sale) |
| `op_lead_status` (+items), `op_lead_site_status`, `op_lead_site_stage`, `op_leads_related_base_stage`, `op_lead_not_ca_type` | enumeration | лид→работа (op_lead_status: item four/five), фронт ПЗ | статусы/стадии заявки |
| `op_lead_is_company`, `op_lead_is_duplicate_check`, `op_lead_is_duplicate`, `op_lead_is_merged_by_exist`, `op_lead_is_boost_sale`, `op_lead_is_black_short` (+reason), `op_lead_is_npp_repoted`, `op_lead_firstprepare_long/history` | boolean/string/int | лид→работа (is_company), writer дублей (is_duplicate*) | маркеры процессов |
| `op_inn` (konstruktor-лист, колонка Лид) | string | админ/менеджер | поиск дублей по ИНН из лида |

### ⚠️ Привязки crm-полей (SETTINGS) — обязательный шаг

Поля типа crm, установленные ДО фикса 2026-08, созданы без привязок —
значения `L_123`/`D_123` Битрикс МОЛЧА не сохраняет. После деплоя свежего
pbx-install нажать переустановку полей сделки и лида (`isNeedUpdate=true`
в шаблоне → userfield.update допишет SETTINGS, данные не трогаются).
Проверка: в карточке сделки выбрать лид в «Лид из которого создана сделка»,
сохранить, F5 — значение должно остаться.

Опционально: 15-я колонка листа `calling_fields` (после isMultiple) — CSV
привязок (`LEAD,DEAL`); пусто/нет = все четыре (безопасный максимум).

### Стадии ЛИДА (экран «Портал → PBX → Лид → Стадии»)

1. Кнопка «Установить недостающие» — создаёт в Битриксе `lead_taken_in_work`
   («Взята в работу», PBX_TAKEN_IN_WORK) и `lead_company_work» («Работа с
   компанией», PBX_COMPANY_WORK). Аддитивно, чужие статусы не трогаются.
2. Вручную сопоставить map-only зеркала: `lead_pres` → существующий статус
   «Презентация» портала, `lead_warm` → «Переговоры» (если есть).
Хук работает с ЛЮБЫМ подмножеством: несопоставленная стадия = пропуск шага.

### После установки

- Сбросить кэш карты полей дублей: `POST /api/duplicates/domain/{domain}/field-map/rescan`
  (иначе op_inn лида попадёт в поиск только через 24 ч TTL).
- Кэш портала сбрасывается автоматически (map/install стадий и полей).

### Роботы Битрикса (URL вебхуков)

| Хук | Событие робота | URL |
|---|---|---|
| лид→работа | смена статуса лида | `POST /api/sales-hooks/lead-to-work/webhook?leadId={{ID}}&responsible={{Ответственный}}` |
| нормализатор | СОЗДАНИЕ сделки | `POST /api/sales-hooks/convert-normalizer/webhook?dealId={{ID}}` |
| буфер отказников | стадия сделки | `POST /api/sales-hooks/reject-buffer/webhook?companyId={{Компания}}` |
| merge / transfer | — (только кнопки фрейма) | `/run`, `/give`, `/take` |

## Архитектура

```
Робот Битрикс ──POST /sales-hooks/<hook>/webhook──► SalesHookSilenceGateway
                                                        │ event-silent (окно тишины 1.5 c)
                                                        ▼
                                     SalesHookSilenceSubscriber (@OnEvent, async:true)
                                                        │
Кнопка фрейма ──POST /sales-hooks/<hook>/run──► SalesHookDispatchService ◄┘
                                                        │  (дедуп + статус queued + jobId=operationId)
                                                        ▼
                                        очередь EVENT_SALES_HOOK_OPS
                                                        │
                                  SalesHookOpsProcessor → SalesHookRunnerService
                                                        │  (pbx.init → буфер → use-case → flush)
                                                        ▼
                          статус done/failed + WS sales-hook:done|error + Bull-retry
```

Одна реализация исполнения на оба пути: разница только в источнике
(`source: robot|frame`) и наличии `socketId`.

## Ключевые файлы

| Что | Где |
|---|---|
| Коды хуков + маппинг на JobNames | `core/constants/sales-hook-code.enum.ts` |
| Контракт use-case | `core/contracts/sales-hook-use-case.contract.ts` |
| Конверт robot-элемента (entityKey + data) | `core/contracts/sales-hook-job.type.ts` |
| Статусы операций (app-cache, TTL 1 ч) | `core/services/sales-hook-status.service.ts` |
| Идемпотентность (NX-lock, seen, alias) | `core/services/sales-hook-idempotency.service.ts` |
| Единая приёмка обоих путей | `core/services/sales-hook-dispatch.service.ts` |
| Исполнитель (обобщённый event-flow.processor) | `core/services/sales-hook-runner.service.ts` |
| Поллинг статуса | `GET /api/sales-hooks/operations/:operationId?domain=` |
| Защита вебхуков (env, выключена по умолчанию) | `core/guards/sales-hook-webhook.guard.ts` |

## Как добавить пятый хук

1. `JobNames.SALES_HOOK_<NEW>` в `libs/queue/src/constants/job-names.enum.ts`
   (очередь НЕ добавляется — все хуки живут в `EVENT_SALES_HOOK_OPS`).
2. Код в `EnumSalesHookCode` + строка в `SALES_HOOK_JOB_NAMES`.
3. `@Process`-метод в `core/queue/sales-hook-ops.processor.ts` (4 строки).
4. `@OnEvent`-метод в `core/queue/sales-hook-silence.subscriber.ts`
   (**обязательно `{ async: true }`** — silence ждёт через emitAsync).
5. Модуль хука по образцу `lead-to-work/`:
   - DTO: `<hook>-run.dto.ts` (extends `SalesHookRunRequestBaseDto`),
     `<hook>-result.dto.ts` (+ OperationDto extends `SalesHookOperationDto`);
   - use-case `implements ISalesHookUseCase` — регистрируется в
     `SalesHookRegistryService` через `onModuleInit` модуля;
   - контроллер: `/webhook` (робот, guard) и/или `/run` (кнопка).
6. Импорт модуля в `sales-hooks.module.ts`.
7. Тесты в `__tests__/` (см. `core/__tests__/` как образец).

## Обязательные правила

- **Доменная идемпотентность в use-case** — кэш-слои каркаса вспомогательные
  и могут потерять состояние. Use-case перед записью перечитывает состояние
  в Битриксе (поля-маркеры, существующие сделки) и при совпадении возвращает
  «пропущено», а не пишет второй раз.
- **Никакого `this.bitrix` в @Injectable** — инстанс приходит в
  `SalesHookExecutionContext` каждого вызова; доменные flow-сервисы
  создаются `new Service(ctx.bitrix, ctx.portal)`.
- **Batch-группы** — use-case queue-ит команды в `ctx.buffer` группами
  (`endGroup()` на группу), финальный `flush()` делает runner. Правила —
  `ai/rules/bitrix-batch-grouping.md`.
- **Импорт буфера** — ТОЛЬКО из `../shared/batch` (реэкспорт; единственная
  точка связи с cold-hook). Не из cold-hook напрямую и не из бочки shared.
- **cold-hook не трогаем** — заморожен до отдельного рефакторинга.
- **Разрушающие операции** (merge) — `dryRun` по умолчанию true, выполнение
  только с planHash-подтверждением, порции ≤5, никаких batch-вариантов.

## Env

| Переменная | Смысл | Дефолт |
|---|---|---|
| `SALES_HOOK_WEBHOOK_AUTH_ENABLED` | Включить проверку ключа `?hookKey=` на вебхуках | `false` (включать после перенастройки роботов) |
| `SALES_HOOK_WEBHOOK_KEYS` | Ключи формата `имя:ключ:domain1\|domain2` (как AGENT_API_KEYS) | — |

## Отладка

- Джобы копятся, ничего не происходит → нет строки
  `SalesHookOpsProcessor initialized` в логах — модуль не подключён.
- Пачка робота «пропала» → смотри лог подписчика: «отброшена как повтор»
  (seen-маркер 300 с) — это защита от дублей робота, не ошибка.
- Redis общий между dev-инстансами — silence-каналы и очередь один на всех
  (см. раздел изоляции в `libs/core/src/event-silence/EVENT_SILENCE_GUIDE.md`).
