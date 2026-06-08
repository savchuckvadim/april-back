# Модуль `smart-act` — описание

Модуль синхронизирует **смарт‑процесс «Акт оказанных услуг» (`service_act`)** с **сервисными сделками** портала Bitrix24 (домен `gsr.bitrix24.ru`).

Идея: по договору длиной N месяцев на каждый месяц должен существовать ровно один смарт‑акт. Акты за прошедшие месяцы должны быть закрыты (успех), акт за текущий месяц — в работе. Товарные строки и количество (`quantity`) должны соответствовать сроку договора и оплаченным месяцам. Модуль приводит реальное состояние CRM к этому «эталону» и ставит ответственному задачи‑предупреждения о недостающих данных.

---

## 1. Концептуальное описание (что делается с каждой сделкой по шагам)

**Запуск алгоритма:**
- **По расписанию — еженедельно** (целевой основной сценарий). Запускать будет планировщик из модуля [`deals-schedule`](../deals-schedule/services/shcedler.service.ts) (сейчас там стоит `//TODO smart act - обрабатывать акты по расписанию - раз в неделю`; `SmartActModule` в `DealsScheduleModule` уже импортирован). Прогон без `dealId` — по всем подходящим сделкам.
- **По вебхуку из Bitrix** (`POST /smart-by-deal-act/ork-acts-webhook`) — точечный запуск, обычно с конкретным `dealId`.

Алгоритм обрабатывает **все открытые + проигранные** сервисные сделки (либо одну сделку по `dealId`). Для каждой сделки:

> ⚠️ Сейчас выборка сделок дополнительно ограничена фильтром по ответственному `assignedById = '221'` — это **тестовое значение**, в дальнейшем фильтра по ответственному не будет (обрабатываются сделки всех ответственных).

### Шаг 1. Сбор данных сделки
- Берётся сделка из категории `service_base` с полями: компания (`COMPANY_ID`), ответственный (`ASSIGNED_BY_ID`), стадия, поля периода договора **`contract_start` («с»)** и **`contract_end` («по»)**.
- Берутся **товарные строки сделки** (`productRow.list`, ownerType = `D`). Из первой строки:
  - `productQuantity` = `quantity` первой строки;
  - `productCoefficient` = множитель из **названия единицы измерения** (`measureName`): содержит «24» → 24, «12» → 12, «6» → 6, «3» → 3, иначе 1. Это «упаковка» лицензии: сколько месяцев покрывает одна единица товара.
- Берутся **существующие смарт‑акты** сделки (`item.list` смарта `service_act`, `parentId2 = dealId`). У каждого определяются: роль стадии (`new` / `planned` / `inwork` / `success` / `fail`), сырой `stageId` (для ранжирования переходов по SORT), период `from`/`to` (UF‑поля `ufCrm13PeriodFrom/To`), количество (`ufCrm13ProductCount`).

> **Модель стадий акта** (жизненный цикл по SORT): Новая(NEW) → **Запланирован**(PREPARATION)=`planned` → **Выписан**(CLIENT)=`inwork` (в работе) → «У клиента»/«Оплачен» (ручные промежуточные) → **Сдан/Успех**(SEMANTICS=S)=`success`. Отказ/Не состоялся (SEMANTICS=F)=`fail`. Алгоритм выставляет «эталон»: прошедшие месяцы → Сдан, текущий → Выписан, будущие → Запланирован; и **двигает стадию только вперёд по SORT** (ручные «У клиента»/«Оплачен» и уже закрытые не откатывает).

### Шаг 2. Расчёт периода договора (в месяцах)
Из дат `from`/`to` считается (`DealPerodDataService`):
- **`totalMonths`** — длина договора в месяцах. Полные календарные месяцы + округление «по половине месяца» (остаток ≥ 15 дней → +1 месяц).
- **`passedMonths`** — сколько полных месяцев уже прошло на сегодня.
- **`currentMonth`** — текущий месяц договора (`passedMonths + 1`, но не больше `totalMonths`); `0`, если договор ещё не начался.
- **`remainingMonths`** — сколько осталось.

### Шаг 3. Построение плана сверки (reconcile) по сделке
Сравнивается «ожидаемое» с «фактическим» и формируется список действий (`actions`):

1. **Нет данных** (`notify_responsible_missing_data`): пустая дата «с»/«по» или нет товаров → дальше ничего не меняем, только предупреждаем.
2. **Договор не начался** (`skip_contract_not_started`): `currentMonth ≤ 0` → ничего не делаем.
3. **Сдвиг начала договора под лицензию** (`align_contract_start_one_month_license`): если коэффициент ∈ {6, 12, 24} и календарная длина договора ровно на 1 месяц больше, чем `qty × коэффициент` (оплаченные месяцы) → дату «с» нужно сдвинуть на месяц вперёд (лишний календарный месяц — ошибка ввода).
4. **Удалить «не состоявшиеся» акты** (`remove_failed_acts`): есть акты в стадии `fail` → удалить, чтобы не искажали расчёт.
5. **Создать недостающие акты** (`create_new_act`): фактическое число актов меньше ожидаемого. Ожидаемое = `totalMonths` (акты создаются **на весь срок договора сразу**, а не только до текущего месяца).
6. **Удалить лишние акты** (`remove_extra_acts`): актов больше `totalMonths` (укоротили договор задним числом).
7. **Закрыть акты** (`close_inprogress_act`): за прошедшие месяцы акты должны быть в `success`.
8. **Увеличить/уменьшить товары** (`increase_deal_products` / `decrease_deal_products`): `quantity` строк сделки подгоняется под потолок (не больше месяцев договора и не опережая число закрытых актов) либо сокращается под срок договора.
9. Если ничего не нужно — `nothing_to_do`.

Дополнительно строятся **календарные слоты** `expectedActPeriods` — по одному на каждый месяц договора, с точными `from`/`to` (первый слот начинается с даты «с», последний кончается датой «по»).

### Шаг 4. Применение плана к CRM
- Если был сдвиг даты начала договора — **обновляется UF‑поле «с»**, в таймлайн сделки пишется комментарий, и **план пересчитывается заново** (т.к. изменились месяцы и слоты).
- Для каждой сделки выполняется синхронизация актов (`syncDealActsFromPlan`):
  1. Подгоняется `quantity` товарных строк сделки под план.
  2. Удаляются `fail`‑акты (если есть действие).
  3. **Цикл по слотам месяцев 1..N (весь договор)**: для каждого месяца ищется существующий акт с совпадающим периодом:
     - нет акта → **создаётся**: прошедший месяц → `success` (Сдан), текущий → `inwork` (Выписан), будущий → `planned` (Запланирован); в него копируются товарные строки (доля на 1 месяц);
     - акт есть → **стадия двигается вперёд по SORT** до целевой для слота (`ensureStageForward`): назад не откатывает, ручные «У клиента»/«Оплачен» и закрытый «Сдан» не трогает;
     - даты акта не совпали со слотом → **правятся `from`/`to`**;
     - товарные строки акта синхронизируются с долей на месяц.
  4. Удаляются лишние акты сверх нормы (если есть действие).
- ⚠️ До старта договора (`currentMonth ≤ 0`, `skip_contract_not_started`) акты **не создаются** — будущие «Запланирован» появятся при первом прогоне после начала договора.
- В конце **ставятся задачи‑предупреждения** ответственному: о сдвиге даты, об отсутствии компании / даты «с» / даты «по» / товаров.

### Что попадает в товарную строку акта
Строка сделки «разбивается» на 1 месяц: цена за единицу = `(цена × qty_строки) / месяцы_покрытия`, `discountSum / месяцы`, `quantity = 1`, владелец — элемент смарт‑процесса (`ownerType = DYNAMIC_{entityTypeId}`). Запись делается только если текущие строки акта отличаются от желаемых.

---

## 2. Техническое описание (как исполняется по структуре модуля)

### Точка входа
- **`controllers/deal-act.controller.ts`** — `POST /smart-by-deal-act/ork-acts-webhook` (и `…-test`). Принимает `BxWebHookDto` (берёт `auth.domain`) и опциональный `dealId`. Только кладёт задачу в очередь через `SmartActQueueService` — синхронной обработки в HTTP нет.
- **`services/queue/smart-act.queue.service.ts`** — `dispatch(QueueNames.SERVICE_GENERATE_ACTS, JobNames.SERVICE_GENERATE_ACTS, { domain, dealId })`.
- **`queue/smart-act.processor.ts`** — `@Processor(SERVICE_GENERATE_ACTS)`; на `@Process` вызывает `ActNProductHandlerUseCase.execute(domain, dealId)`.

### Use‑cases (`usecases/`)
- **`act-n-product-handler.use-case.ts`** — оркестратор. `@Injectable`, инжектит только `PBXService` + другие use‑case/сервисы. Bitrix‑инстанс получает локально через `this.pbx.init(domain)` (см. правило про race condition). Делает: reconcile → сдвиг даты «с» (+ повторный reconcile) → `syncDealActsFromPlan` по каждому плану → батч задач‑предупреждений (`SmartActWarningTaskService`, создаётся через `new` с локальным `bitrix`).
- **`ork-acts-reconcile-plan.use-case.ts`** — чистая бизнес‑логика плана. `buildDealPlan(item)` считает `actsSummury` / `monthPeriodSummary` / `productsSummary`, формирует `actions: IReconcileActionPlanItem[]` и `expectedActPeriods`. Тип действия — `TReconcileActionType`.
- **`ork-acts-update.use-case.ts`** — загрузка данных: сделки (`OrkDealsService`) + товарные строки (`OrkActsProductRowsService`) + смарт‑акты (`SmartActGsrService`). Возвращает `IDealWithRows[]`. ⚠️ Тестовые ограничения (будут убраны): константа `assignedById = '221'` (фильтр по ответственному — временный), `openDeals.filter((d, i) => i < 10)` (только первые 10 сделок) и `delay(2000)` на каждой сделке.
- **`usecases/utils/act-slot-sync.util.ts`** — чистые функции матчинга акта со слотом: `coerceSmartActId`, `isoDatesRoughlyEqual` (допуск ±1 сутки), `periodMatchesSlot`, `findUnusedActMatchingSlot`, **`resolveCreateStageForSlot(monthIndex, passedMonths)` → `'success' | 'inwork' | 'planned'`** (целевая стадия слота: прошедший → success, текущий → inwork, будущий → planned). Покрыто `act-slot-sync.util.spec.ts`.

### Сделки и периоды (`services/ork-deals/`)
- **`ork-deals.service.ts`** — `getDealService`: тянет `fail` + `open` сделки, маппит каждую в `IOrkDeal { deal, periodData }`.
- **`deal-query.service.ts`** — `deal.all` по фильтру (`CATEGORY_ID = service_base`, `CLOSED = N` / стадия fail), список UF‑полей; поля периода через `getContractPeriodFieldBitrixId`.
- **`deal-perod-data.service.ts`** — весь расчёт месяцев (`totalMonths` с округлением по половине месяца, `passedMonths`, `currentMonth`, `remainingMonths`).
- **`utils/build-contract-act-periods.util.ts`** — `buildContractActPeriods(from, to, count)` → массив слотов `IContractActPeriodSlot { monthIndex, from, to }`.
- **`utils/deal-license-calendar-one-month-shift.util.ts`** — паттерн «лицензия N мес. + 1 лишний календарный» → новая дата «с».
- **`utils/get-contract-period-field.util.ts`** — резолв Bitrix‑id полей `contract_start`/`contract_end` через `PortalModel`.

### Смарт‑процесс актов (`services/smart/`)
- **`smart-act-gsr.service.ts`** (`@Injectable`) — чтение смарт‑актов сделки (`getSmartActItemsByDeal`), маппинг элемента в `IActSmartItemResult` (включая сырой `stageId`). **`getItemStageType(item)` → `TStageType`** определяет роль стадии по `stageId` (`includes('NEW'/'SUCCESS'/'FAIL'/'CLIENT')`, иначе `planned`). Тип `TStageType = 'new' | 'planned' | 'inwork' | 'success' | 'fail'`.
- **`category-smart-act.service.ts`** (`@Injectable`) — категории/стадии смарта с кэшем в Redis (TTL 30 мин). `isNewStage/isSuccessStage/isFailStage/isInWorkStage`, `getSmartStageDataForCreate` → `{ new, planned, inwork, success }` (резолв `STATUS_ID`: planned=PREPARATION, inwork=CLIENT, success=SEMANTICS S).
- **`smart-act.service.ts`** (создаётся через `new`, не провайдер) — мутации акта: `createSmartActGsr(dto)` (стадия по `dto.stageType` через `resolveStageData`), **`ensureStageForward(id, currentStageId, targetStageType)`** (переход стадии только вперёд по SORT — не откатывает назад/не реанимирует Сдан; покрыто `smart-act.service.spec.ts`), `updateSmartActFromTo`, `delete`. Заголовок акта — «с … по …».
- **`smart-product-row.service.ts`** + **`utils/deal-product-row-monthly.util.ts`** — расчёт и запись товарных строк акта (доля на 1 месяц), сравнение снимков перед `productRow.set` (флаг `SMART_ACT_PRODUCT_ROWS_SYNC`).
- **`smart-deal-product-row.service.ts`** — изменение `quantity` строк **сделки** по действиям increase/decrease (флаг `SMART_ACT_DEAL_QTY_SYNC`), затем рефреш строк в плане.
- **`utils/deal-product-coefficient.util.ts`** — коэффициент из `measureName`.

### Задачи и таймлайн (`services/task/`, `services/timeline/`)
- **`smart-act-plan-warning.constants.ts`** — словарь предупреждений `SMART_ACT_PLAN_WARNINGS` и тип `SmartActPlanWarningKind`.
- **`smart-act-plan-warning-from-plan.util.ts`** — из плана собирает список предупреждений (нет компании / «с» / «по» / товаров).
- **`smart-act-task-warning.service.ts`** (через `new`) — ставит задачи Bitrix батчем (`batch.task.add` + `callBatchWithConcurrency(1)`), привязка к сделке/компании через `UF_CRM_TASK`.
- **`smart-act.timeline.service.ts`** (через `new`) — комментарий в таймлайн сделки о сдвиге даты начала.

### Регистрация
- **`smart-act.module.ts`** — импортирует `PBXModule`, `RedisModule`, `QueueModule`; провайдеры — `@Injectable`‑сервисы и use‑cases. Сервисы, требующие конкретного `bitrix`‑инстанса (`SmartActService`, `SmartProductRowService`, `SmartDealProductRowService`, `SmartActWarningTaskService`, `SmartActTimelineChangeContractStartService`, `OrkActsProductRowsService`), создаются через `new(bitrix, …)` внутри use‑case — намеренно, чтобы избежать race condition с `this.bitrix`.

### Поток данных (кратко)
```
webhook → SmartActQueueService.send → очередь SERVICE_GENERATE_ACTS
       → SmartActProcessor → ActNProductHandlerUseCase.execute
            → OrkActsReconcilePlanUseCase.execute
                 → OrkActsUpdateUseCase.execute (сделки + товары + смарт-акты)
                 → buildDealPlan (actions + слоты)
            → сдвиг даты «с» (опц.) → повторный reconcile
            → syncDealActsFromPlan (delete fail / create на весь договор / ensureStageForward / update from-to / товары / remove extra)
            → задачи-предупреждения (батч)
```

### Ключевые места про стадии акта (важно для будущего рефакторинга)
Стадия акта проходит через несколько слоёв, и **новый тип стадии нужно добавлять согласованно во всех**:
1. `TStageType` — union ролей стадий (`smart-act-gsr.service.ts`).
2. `getItemStageType` — распознавание роли существующего акта по `stageId` (`smart-act-gsr.service.ts`).
3. `CategorySmartActService` — `isXStage` + резолв `STATUS_ID` для создания (`getSmartStageDataForCreate`: new/planned/inwork/success).
4. `resolveCreateStageForSlot` — какую стадию назначать слоту месяца (`act-slot-sync.util.ts`).
5. `OrkActsReconcilePlanUseCase` — подсчёт `actsSummury` (что считать closed/inprogress/fail) и формирование `actions`.
6. `SmartActService.resolveStageData` / `createSmartActGsr` — маппинг `stageType → STATUS_ID` при создании.
7. `SmartActService.ensureStageForward` — переходы стадий существующих актов (ранжирование по SORT).
8. `ActNProductHandlerUseCase.syncDealActsFromPlan` — вызовы создания/переходов по слотам.

> Хардкод стадий/полей/`domain` — см. задачу на portal-agnostic провижининг: [`docs/tasks/smart-act-portal-agnostic-provisioning.md`](../../../../docs/tasks/smart-act-portal-agnostic-provisioning.md).
