# Bitrix Batch Grouping

Правила работы с batch-командами Bitrix, когда **внутри одного потока** надо отправить много команд, и часть из них **зависит друг от друга** через `$result[cmdKey]`.

Эталон реализации в проекте — [cold-hook-batch-group-buffer.ts](../src/apps/event-sales/cold-hook/services/batch/cold-hook-batch-group-buffer.ts) + использование в [cold-call.use-case.ts](../src/apps/event-sales/cold-hook/use-cases/cold-call.use-case.ts) и [cold-hooks-handler.service.ts](../src/apps/event-sales/cold-hook/services/silence/cold-hooks-handler.service.ts).

---

## 1. Когда применять этот паттерн

Используйте **batch group buffer**, если выполняются одновременно ДВА условия:

1. **Команд много.** Их количество масштабируется со входом (одна обработка хука → десятки/сотни компаний → сотни команд).
2. **Между командами есть зависимости через `$result[cmdKey]`.** Например:
    - создать сделку → задача с `UF_CRM_TASK: ['D_' + $result[deal_cmd_key]]`
    - создать сделку → продуктовая строка с `ownerId: $result[deal_cmd_key]`
    - создать компанию → сделка с `COMPANY_ID: $result[company_cmd_key]`

Типичные триггеры применения:

- Silence-хуки (`cold-hook`, `pre-cold-*`), обрабатывающие N компаний.
- Импорт-команды, в которых на каждую строку из источника надо создать связанную цепочку сущностей.
- Любой код, где после `bitrix.batch.X.set(...)` следующая команда ссылается на ID только что созданной сущности через `$result[...]`.

Если зависимостей **нет** (все команды независимы), достаточно обычного `bitrix.batch.*` + `bitrix.api.callBatchWithConcurrency(N)` — буфер не нужен.

---

## 2. Почему это нужно — особенности Bitrix REST API

### 2.1 Лимит 50 команд на один batch

Bitrix REST принимает в одном вызове `batch` **не более 50 команд**. Если очередь длиннее — её обязательно надо нарезать на чанки.

### 2.2 `$result[cmdKey]` живёт только внутри ОДНОГО HTTP-batch

Подстановка `$result[some_cmd_key]` резолвится Bitrix-сервером **во время обработки одного `batch`-вызова**, последовательно проходя по командам этого вызова. Если команды-производитель и команды-потребитель попали в **разные HTTP-batch** (даже идущие подряд) — потребитель получит **строку `"$result[some_cmd_key]"` как литерал**, а не подставленный ID. Запрос либо упадёт с ошибкой типа, либо молча запишет мусор в поле.

Иначе говоря: **граница HTTP-batch — это граница видимости `$result[...]`**.

### 2.3 Параллельные batch усугубляют проблему

Если зависимые команды развести по разным HTTP-batch И ещё параллельно отправить — даже если бы `$result` пересекался, появилась бы гонка: потребитель может уйти раньше производителя.

---

## 3. Почему это нужно — особенности нашей библиотеки `src/modules/bitrix`

### 3.1 Общая очередь команд

`BatchApiService` ([batch-api.service.ts](../src/modules/bitrix/core/base/batch-api.service.ts)) хранит **одну общую очередь** команд в `cmdBatch: Record<string, string>` на инстанс `bitrix.api`. Все вызовы `bitrix.batch.<entity>.<method>(key, payload)` пишут сюда же, по порядку. Порядок добавления = порядок отправки.

### 3.2 Слепое нарезание по 50

Любой `callBatch* (callBatch / callBatchAsync / callBatchWithConcurrency)` берёт `Object.entries(this.cmdBatch)` и **слепо режет на чанки по 50** — без понимания, какие команды связаны через `$result[...]`. Если связанные команды стоят на границе чанков (например, `deal.set` оказался 50-й командой, а `task.add` с `UF_CRM_TASK: ['D_$result[deal_key]']` — 51-й), `$result[...]` сломается.

### 3.3 `callBatchWithConcurrency(limit)` запускает параллельные воркеры

`callBatchWithConcurrency(2)` гонит до 2 параллельных HTTP-batch одновременно. Даже если связанные команды оказались близко по индексу — они могут попасть в разные параллельные чанки и обработаться не по порядку.

### 3.4 После любого `callBatch*` очередь обнуляется

Все варианты `callBatch*` в конце делают `this.cmdBatch = {}`. Это значит, что **между фазами** проекта `cmdBatch` всегда чистый — буфер можно безопасно создавать и использовать локально.

---

## 4. Контракт паттерна

### 4.1 Минимальный API буфера

```ts
class XxxBatchGroupBuffer {
    queue(enqueue: () => void): void;          // отложенный bitrix.batch.* вызов
    endGroup(): Promise<void>;                 // атомарно коммитит группу
    flush(): Promise<void>;                    // отправляет всё, что накоплено
    getResults(): IBitrixBatchResponseResult[];
    getCurrentGroupSize(): number;
    getBufferSize(): number;
}
```

Класс **не `@Injectable`** — создаётся через `new` внутри handler/use-case под конкретный `BitrixService`-инстанс (актуальный домен).

### 4.2 Алгоритм

1. **Группа** — это атомарный набор команд, между которыми существуют `$result[...]` ссылки. Например: «все команды одной компании».
2. Внутренние сервисы вызывают `buffer.queue(() => bitrix.batch.X.Y(key, payload))` — **сам enqueue в `cmdBatch` откладывается** до момента коммита группы.
3. Use-case (или handler) сигнализирует конец группы вызовом `await buffer.endGroup()`. В этот момент:
    - если `bufferSize + groupSize > 50` — сначала `flush()` (отправка буфера одним HTTP), затем коммит группы;
    - иначе — лямбды группы выполняются, команды попадают в `bitrix.api.cmdBatch`.
4. После цикла обработки — `await buffer.flush()` сливает остаток.

### 4.3 Почему `callBatchWithConcurrency(1)` для flush

Буфер всегда поддерживает **bufferSize ≤ 50**. При таком объёме `callBatchWithConcurrency(1)` делает ровно **один HTTP-вызов** к `batch` (один воркер, один проход внутреннего цикла). Это то, что нужно: `$result[...]` валиден.

Не используйте `callBatchWithConcurrency(N)` с `N > 1` — на корректность буфера это не повлияет (буфер всё равно ≤50), но скрывает намерение «один HTTP-batch».

### 4.4 Размер группы не нужно знать заранее

Команды добавляются через `queue(fn)` стримово — буфер сам считает длину текущей группы. На `endGroup()` принимается решение о flush. Если размер группы превысит 50 — буфер бросит исключение: такой группой невозможно отправить атомарно, и это сигнал к декомпозиции (разбить на подгруппы без cross-`$result`).

---

## 5. Где границы группы

- **Use-case** (например, `ColdCallUseCase.flow`) — естественная единица. Одна сущность входа (одна компания, одна строка импорта) = одна группа. `await buffer.endGroup()` стоит в конце `flow`.
- **Handler** создаёт буфер, прогоняет цикл use-case с `await`, в конце вызывает `await buffer.flush()` и читает `buffer.getResults()` для логирования.

```ts
// handler
const buffer = new XxxBatchGroupBuffer(bitrix);
for (const item of items) {
    await useCase.flow(item, ..., buffer);   // ← await обязателен
}
await buffer.flush();
this.logger.log(`Batch result: ${JSON.stringify(buffer.getResults())}`);
```

```ts
// use-case
async flow(..., buffer: XxxBatchGroupBuffer) {
    entityService.flow(..., buffer);
    dealService.flow(..., buffer);
    taskService.flow(..., buffer);
    listService.flow(..., buffer);
    await buffer.endGroup();
}
```

```ts
// inner-service
public flow(..., buffer: XxxBatchGroupBuffer) {
    buffer.queue(() =>
        this.bitrix.batch.deal.set(`new_base_deal_${companyId}`, payload),
    );
    buffer.queue(() =>
        this.bitrix.batch.task.add(`task_${companyId}`, {
            ...,
            UF_CRM_TASK: [
                'CO_' + companyId,
                'D_$result[new_base_deal_' + companyId + ']',
            ],
        }),
    );
}
```

---

## 6. Anti-patterns

### 6.1 ❌ Прямой `bitrix.batch.*` мимо буфера

Если в проекте уже введён буфер, inner-сервисы **не должны** обходить его и пушить команды напрямую в `bitrix.api.cmdBatch` — порядок и принадлежность к группе нарушится.

### 6.2 ❌ `bitrix.api.callBatchWithConcurrency(N)` рядом с буфером

После того как буфер собрал команды компании, **не вызывайте** `callBatchWithConcurrency` напрямую — это сольёт текущее содержимое `cmdBatch` без учёта границ групп. Все вызовы batch должны идти **только через `buffer.flush()`**.

### 6.3 ❌ Группа из 50+ команд

Если группа разрослась — её невозможно отправить атомарно. Декомпозируйте: вынесите слой команд, которому `$result[...]` не нужен, в отдельную фазу (предварительный `callBatchWithConcurrency` до буфера).

### 6.4 ❌ Использование `$result[...]` между чанками

В коде ни в каком виде не закладывайтесь на то, что `$result[some_key]` будет резолвиться, если `some_key`-производитель и потребитель не находятся в одной группе одного буфера.

### 6.5 ❌ Несинхронизированный цикл в handler

```ts
// ❌ use-case.flow стал async, но handler его не awaitит
for (const item of items) {
    useCase.flow(item, ..., buffer); // promise теряется
}
await buffer.flush();
```

Группы будут коммититься в произвольном порядке относительно flush — буфер сломается. Цикл всегда `await useCase.flow(...)`.

### 6.6 ❌ Один буфер на несколько доменов

`BitrixService` зависит от домена (см. [CLAUDE.md](../CLAUDE.md), `PBXService.init(domain)`). Буфер привязан к `bitrix.api.cmdBatch` своего инстанса. Если в одной операции обрабатываются разные домены — на каждый домен создаётся свой буфер.

---

## 7. Когда буфер избыточен

- Команд мало (одна-две, всегда влезают в 50).
- `$result[...]` не используется вообще.
- Нужна фазовая обработка: создать все сделки → прочитать реальные ID из ответа → создать задачи с реальными ID. Это альтернатива буферу, и она проще там, где число фаз невелико (≤3) и можно потерпеть лишние HTTP round-trip'ы. Применима, например, в админ-командах разовой миграции.

---

## 8. Чеклист при добавлении нового кода

- [ ] В цепочке есть зависимость через `$result[...]`?
- [ ] Объём команд масштабируется со входом?
- [ ] Создан локальный `*BatchGroupBuffer` под этот модуль (если паттерн не переиспользуется глобально — лежит рядом с use-case'ом, не в `src/modules/bitrix`).
- [ ] Inner-сервисы принимают `buffer` и используют только `buffer.queue(...)`.
- [ ] Use-case вызывает `await buffer.endGroup()` в конце.
- [ ] Handler делает `await buffer.flush()` в конце цикла.
- [ ] Размер любой группы строго ≤50.
- [ ] Цикл use-case'ов в handler — `await`-нутый.
- [ ] Нет прямых вызовов `bitrix.api.callBatch*` параллельно с буфером.
