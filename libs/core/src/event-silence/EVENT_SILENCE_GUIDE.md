# Event Silence — модуль накопления хуков с дебаунсом

## Зачем нужен

Внешние системы (Bitrix24, входящие webhook'и) умеют присылать **burst'ы** хуков
по одному и тому же объекту — например, серия `ONCRMENTITYUPDATE` при массовом
изменении. Если на каждый хук синхронно лезть в Bitrix и что-то делать, получаем:
- N+1 запросов вместо одного batch'а;
- гонки (две параллельные обработки одной и той же сделки);
- лишнюю нагрузку на API и rate-limit от Bitrix.

`EventSilenceModule` решает это так: **копит входящие данные в Redis-hash, ждёт
"тишины" (1.5с без новых хуков для этого ключа), затем эмитит одно событие
с собранной пачкой**. Подписчик обрабатывает пачку одним проходом.

## Как устроено внутри

### Поток данных

```
Hook 1 ─┐
Hook 2 ─┤  silentManager.handle()    ┌─ event-silent queue ─┐    ┌─ @OnEvent ─┐
Hook 3 ─┼─►  Redis: hset / lock /  ──┤  EventSilentJob       ├──►│ обработка  │
Hook N ─┘  ►  NX-guard / dispatch     │  Processor.handle()   │   │ накопленной│
                                      │  → waitUntilSilent    │   │ пачки      │
                                      │  → collectAndClear    │   └────────────┘
                                      │  → emitAsync          │
                                      └───────────────────────┘
```

### Redis-ключи (на один `keyPrefix`)

| Ключ          | Назначение                                                       | TTL       |
|---------------|------------------------------------------------------------------|-----------|
| `{prefix}_data` | HASH, в котором копятся входящие хуки. Field — `seq`-id, value — JSON | 30c |
| `{prefix}_lock` | "Идёт burst". Продлевается каждым хуком. **Исчезновение = тишина** | 1.5с |
| `{prefix}_job`  | NX-guard: "job на это окно уже dispatched". Снимается после сбора данных | 30c |
| `{prefix}_seq`  | INCR-счётчик для уникальных field'ов в hash при параллельных запросах | 30c |

> `keyPrefix` целиком определяет "канал дебаунса". Хуки с разным `keyPrefix`
> копятся независимо и не блокируют друг друга. Обычно `keyPrefix` строят как
> `{usecase}_{domain}_{entity}_{responsible}` — чем уже, тем меньше ложных
> группировок и меньше Redis-конкуренции.

### Жизненный цикл одного окна тишины

1. **Hook прилетел** → `handle()`
   - `INCR seq` → уникальный id field'а;
   - `HSET data {id} {json}` → сохранили payload;
   - `SET lock '1' PX 1500` → "я ещё сыплюсь";
   - `SET job '1' PX 30000 NX` → пытаемся захватить guard.
   - Если guard захвачен (`wasSet === 'OK'`) — **диспатчим job** в `event-silent` Bull-очередь.
2. **Воркер event-silent поднимает job** → `EventSilentJobProcessor.handle()`
   → `EventSilentJobManagerService.process()`.
3. **`waitUntilSilent`** — пуллим `EXISTS lock` каждые 500мс пока ключ не исчезнет
   (т.е. пока прошло ≥1.5с без новых хуков для этого `keyPrefix`).
4. **`collectAndClear`** — забираем всё из hash, удаляем `data` И `job` ключи.
   Удаление `job` критично: разрешает следующим хукам сразу поставить **новый**
   job в `event-silent`, который встанет за текущим (Bull concurrency=1) и
   обработается последовательно после.
5. **`emitAsync('silence:{jobName}', { collected, payload })`** —
   ждёт всех подписчиков с `{ async: true }`. Здесь происходит реальная работа.

### Что гарантирует последовательность

- `event-silent` queue с **concurrency=1 (default Bull)** — два разных окна
  одного `keyPrefix` никогда не обрабатываются параллельно.
- `del(jobKey)` ВНУТРИ `collectAndClear` — следующий job может встать в очередь
  пока текущий ещё в emitAsync. Bull обработает их в FIFO порядке.

## Как пользоваться (рецепт)

### Шаг 1. Подключить модуль

```ts
// some-feature.module.ts
import { EventSilenceModule } from '@/core';

@Module({
    imports: [EventSilenceModule, /* ... */],
    providers: [MyEndpointService, MyHandlerService],
})
export class MyFeatureModule {}
```

### Шаг 2. Положить новый job-имя в `JobNames` enum

```ts
// src/modules/queue/constants/job-names.enum.ts
export enum JobNames {
    EVENT_COLD_CALL = 'cold-call',
    EVENT_MY_NEW_THING = 'my-new-thing',  // ← добавили
}
```

### Шаг 3. Endpoint-сервис: приём хука + подписка на silence-event

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
    EventSilentJobManagerData,
    EventSilentJobManagerHandler,
    EventSilentJobManagerService,
    SILENCE_EVENT_PREFIX,
} from '@/core/event-silence';
import { JobNames } from '@/modules/queue/constants/job-names.enum';

interface IMyData {
    entityId: string;
    /* ... */
}

@Injectable()
export class MyEndpointService {
    private readonly logger = new Logger(MyEndpointService.name);

    constructor(
        private readonly handler: MyHandlerService,
        private readonly silentManager: EventSilentJobManagerService,
    ) {}

    /** вызывается из контроллера на каждый входящий хук */
    async onHook(domain: string, payload: IMyData): Promise<void> {
        const domainKey = domain.replace(/\./g, '_');
        // keyPrefix должен сужать "канал дебаунса" до того уровня,
        // на котором имеет смысл объединять хуки в одну пачку
        const keyPrefix = `MY_USECASE_${domainKey}_${payload.entityId}`;

        const item: EventSilentJobManagerData<IMyData> = {
            keyPrefix,
            data: payload,
            jobName: JobNames.EVENT_MY_NEW_THING,
            domain,
        };

        await this.silentManager.handle<IMyData>(item);
    }

    /** срабатывает, когда настала тишина и накопленная пачка готова */
    @OnEvent(`${SILENCE_EVENT_PREFIX}:${JobNames.EVENT_MY_NEW_THING}`, {
        async: true,
    })
    async onSilence(
        data: EventSilentJobManagerHandler<IMyData>,
    ): Promise<void> {
        this.logger.log(
            `silence: domain=${data.payload.domain} items=${Object.keys(data.collected).length}`,
        );
        await this.handler.handlePack(data.payload.domain, data.collected);
    }
}
```

> ⚠ **`{ async: true }` обязателен** — без него `emitAsync` не дождётся
> завершения обработчика и job в Bull завершится раньше, чем сделается работа.

### Шаг 4. Handler-сервис: обработка пачки

```ts
@Injectable()
export class MyHandlerService {
    constructor(private readonly pbx: PBXService) {}

    async handlePack(
        domain: string,
        collected: Record<string, IMyData>,
    ): Promise<void> {
        if (!Object.keys(collected).length) return;

        // bitrix получаем ПО domain через PBXService — никогда не храним this.bitrix
        const { bitrix } = await this.pbx.init(domain);

        // обычно тут: собираем уникальные entityId, делаем один batch-запрос,
        // прогоняем through useCase или обогащаем данные
        // ...

        await bitrix.api.callBatchWithConcurrency(2);
    }
}
```

## Логирование

Модуль логирует **минимально**, чтобы прод-логи не захлёбывались на больших burst'ах:

| Событие                  | Уровень | Где               | Что в логе                                     |
|--------------------------|---------|-------------------|------------------------------------------------|
| Job снят с очереди       | LOG     | `EventSilentJobProcessor` | `Processing job id=N jobName=X domain=Y` |
| `collectAndClear` пуст   | LOG     | `EventSilentJobManagerService` | `No data collected for X, skipping` |
| Emit события подписчикам | LOG     | `EventSilentJobManagerService` | `Emitting silence:X domain=Y items=N` |

Всё остальное (Redis-вызовы, увеличение seq, dispatch) — **молчит специально**.
Если нужна детальная диагностика — добавляйте локально на время отладки и
**убирайте перед коммитом**.

### Что добавить на стороне consumer'а

- В `@OnEvent` обработчике: один LOG с `domain` и `items=` (как в примере выше)
  — это якорь, по которому видно "пачка зашла на обработку".
- В handler'е: лог входа/выхода со временем — полезно для расчёта p95.
- Ошибки внутри handler — ловить и логировать самим. `emitAsync` пробросит
  exception обратно в `process()`, и job упадёт в `failed` со стектрейсом
  (это видно через `queue.getFailed()`).

## На что обратить внимание при доработках

### Изменение `silenceWindowMs` / `dataTtlMs`

- **`silenceWindowMs` (1500мс)** — это **окно тишины**. Слишком мало → пачки
  разваливаются на одиночки. Слишком много → пользователь ждёт.
  Чувствительно: если поднять до 5+ секунд, на больших burst'ах окно может
  никогда не закрываться (хуки приходят чаще чем за 5с). Тогда `process()`
  висит в `waitUntilSilent` пока burst не остановится.
- **`dataTtlMs` (30c)** — safety-net на случай, если воркер задержится
  (stalled job, restart). При штатной работе данные удаляются явно в
  `collectAndClear`. Уменьшать ниже `silenceWindowMs * 5` опасно: при длинном
  burst'е + задержке Bull данные могут истечь до сбора.

### Изоляция dev/prod

**Bull-очереди — это ключи в общем Redis**. Если локальный dev и прод
смотрят в один Redis (`REDIS_URL`), они **шарят очереди** — твой локальный
hook может улететь на обработку проду и наоборот. Симптомы:
- локально dispatch есть, но `Processor.handle` молчит;
- пачка `collected=1` хотя ты накидал 3 хука;
- в логах сервера ты видишь свои локальные хуки.

**Решения** (любое из):
- локальный Redis в Docker для dev, прод-Redis только для прода;
- разные `prefix` в `BullModule.forRootAsync({ prefix: 'dev-${user}' })`.

### Что НЕЛЬЗЯ делать

- **Хранить `bitrix`-инстанс в `@Injectable()` сервисах** — `PBXService.init(domain)`
  возвращает per-request instance с batch-аккумулятором. Если один handler
  закэширует `this.bitrix`, batch'и разных доменов перемешаются и зальют
  запросы не туда. См. CLAUDE.md → "this.bitrix запрещён".
- **Эмитить `silence:` события вручную** — нарушает контракт. Только через
  `silentManager.process()` внутри воркера.
- **Слушать `silence:X` без `{ async: true }`** — `emitAsync` не дождётся,
  job в Bull закроется до завершения работы, handler выполнится "в воздухе"
  без exception-propagation.

## Известные ограничения

1. **`waitUntilSilent` — polling**. Опрашиваем Redis `EXISTS` каждые 500мс.
   Это просто, но на масштабе можно перейти на keyspace-notifications
   (Redis pub/sub при истечении ключа) — будет реактивно и без лишних
   round-trip'ов.
2. **Один Bull worker = последовательная обработка ВСЕХ keyPrefix'ов**.
   Если два независимых "канала" дебаунса пересекаются по времени, второй
   ждёт первый. На высокой нагрузке можно поднять concurrency у `EventSilentJobProcessor`,
   но тогда теряется гарантия "две пачки одного keyPrefix не пересекаются"
   и нужен per-prefix lock внутри `process()`.
3. **Failed job → данные теряются**. Если `handleHooks` упал, job уходит в
   `failed`, `data` ключ уже удалён в `collectAndClear`. Bull-retry поднимет
   ТОТ ЖЕ job (с тем же payload в `job.data`), но это **снимок старого item**,
   а не реальные накопленные хуки. Если нужна гарантия обработки — обрабатывать
   ошибки внутри handler'а и/или собирать данные в `try { ... } catch { не del }`.

## Рекомендации по дальнейшему рефакторингу

### Уровень 1 — мелкие улучшения (быстро, безопасно)

- **Вынести Redis-операции в отдельный `EventSilenceRedisRepository`** —
  сейчас `silent-job-manager.service.ts` смешивает оркестрацию и доступ к Redis.
  После выделения сервис будет на 30-40% короче, и появится возможность
  замокать репозиторий в юнит-тестах без `redis-mock`.
- **`defaultJobOptions: { removeOnComplete: true, removeOnFail: 50 }`**
  в `QueueModule`. Сейчас completed/failed копятся в Redis вечно — у нас
  уже ~140 completed в `event-silent` и эта цифра только растёт.
- **`drainDelay: 300`** для `event-silent` queue в Bull-настройках —
  убирает иногда возникающую 3-4-секундную задержку перед подхватом job'а
  после простоя.

### Уровень 2 — архитектурные (требуют тестов)

- **Заменить polling на keyspace-notifications**. Включить в Redis
  `notify-keyspace-events Ex`, подписаться на `__keyevent@0__:expired`
  по pattern `*_lock`. `waitUntilSilent` становится реактивным:
  `subscribe → resolve когда пришло событие истечения нужного lock-ключа`.
  Меньше Redis-trip'ов, меньше задержки при коротких окнах.
- **Per-prefix lock внутри `process()`** + поднятие concurrency у воркера.
  Сейчас все каналы дебаунса сериализуются глобально. Per-prefix lock
  (например, `SET {prefix}_processing '1' NX EX 60`) позволит обрабатывать
  разные `keyPrefix` параллельно, сохранив гарантию для одного.
- **Метрики через Prometheus/health-endpoint**: counter входящих хуков,
  histogram размера пачки `collected.length`, gauge depth очереди event-silent.
  Сейчас всё это видно только через ручной скрипт `inspect-event-silent-queue.ts`.

### Уровень 3 — большой рефакторинг

- **Унификация с `silent` queue**. В `QueueNames` есть два похожих имени
  (`SILENT` и `EVENT_SILENT`) — судя по `silent-job-handlers` в комментариях
  модуля, раньше существовала альтернативная реализация. Стоит разобраться
  и оставить одну.
- **Перейти с Bull на BullMQ**. Bull 4.x в режиме maintenance, BullMQ
  активно развивается, поддерживает flows (зависимости job'ов), лучше
  работает с stalled-detection и имеет встроенный UI (`@taskforcesh/bullmq-ui`).

## Структура файлов

```
src/core/event-silence/
├── EVENT_SILENCE_GUIDE.md          ← этот документ
├── event-silence.module.ts          ← NestJS-модуль (QueueModule + RedisModule)
├── event-silence.type.ts            ← публичные типы (EventSilentJobManagerData/Handler, SILENCE_EVENT_PREFIX)
├── silent-job-manager.service.ts    ← оркестрация (handle / process / collectAndClear / waitUntilSilent)
├── silent-job.processor.ts          ← Bull worker для очереди event-silent
└── index.ts                         ← реэкспорт публичного API
```

## Пример рабочего consumer'а

Живой код, на котором это работает прямо сейчас:
[src/apps/event-sales/cold-hook/services/silence/cold-hook-silince-endpoint.service.ts](../../apps/event-sales/cold-hook/services/silence/cold-hook-silince-endpoint.service.ts).
