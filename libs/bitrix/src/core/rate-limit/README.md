# Bitrix Rate Limiter

Глобальный rate limiter для Bitrix REST API на основе Redis.  
Реализует алгоритм **Leaky Bucket** — такой же, как на стороне Bitrix, чтобы проактивно не превышать лимит до получения ошибки `QUERY_LIMIT_EXCEEDED`.

---

## Проблема

Каждый вызов `pbxService.init(domain)` создаёт новый инстанс `BitrixBaseApi → BitrixCore`, у каждого — свой локальный `Semaphore(10)`.  
При нескольких одновременных инстансах на один domain суммарный поток запросов к Bitrix не контролируется: каждый инстанс «думает», что он один.

---

## Решение

`BitrixRateLimiterService` — один синглтон на всё приложение.  
Redis-ключ `bitrix:rate:{domain}` разделяется между всеми инстансами, работающими с одним порталом.

```
Запрос в любом сервисе
  → pbxService.init(domain) → BitrixBaseApi → BitrixCore.request()
      → rateLimiter.acquire(domain)   ← глобально, per domain, через Redis
      → semaphore.acquire()           ← локально, per instance
      → HTTP запрос к Bitrix
```

---

## Лимиты Bitrix (из документации)

| Тариф       | Скорость дренажа Y | Ёмкость ведра X |
|-------------|-------------------|-----------------|
| Прочие      | 2 req/сек         | 50              |
| Энтерпрайз  | 5 req/сек         | 250             |

Лимит считается **per portal (domain)** и **per IP** вашего сервера.  
Ошибки: `HTTP 503 QUERY_LIMIT_EXCEEDED` при переполнении ведра.

---

## Включение/отключение

Переменных окружения у ограничителя нет (с 06.10.2026, решение владельца:
тариф — свойство портала, а не сервера). Всё задаётся в настройках портала
(админка → портал → «Настройки приложений» → «Портал (общие)»):

- «Битрикс24: очередь запросов включена» (`bitrix_rate_limit_enabled`, по
  умолчанию да). Выключена — `acquire()` возвращается мгновенно без Redis;
- «Битрикс24: тариф для лимита запросов» (`bitrix_rate_plan`: обычный — по
  умолчанию, или энтерпрайз).

Значения по умолчанию — константы в `bitrix-rate-limiter.config.ts`
(`DEFAULT_BITRIX_PLAN`, `RATE_LIMIT_CLASS_POLICIES`). Переменные
`BITRIX_RATE_LIMIT_ENABLED` и `BITRIX_PLAN` больше не читаются.

---

## Структура файлов

```
rate-limit/
├── bitrix-rate-limiter.config.ts   — конфиги тарифов (capacity, ratePerSec)
├── bitrix-rate-limiter.service.ts  — сервис с Leaky Bucket Lua-скриптом
├── bitrix-rate-limiter.spec.ts     — юнит-тесты
└── README.md
```

---

## Как работает Lua-скрипт

Атомарное чтение и обновление состояния ведра в Redis (`HMGET` / `HMSET`):

1. Читает текущий `count` и timestamp `ts`
2. Вычисляет сколько запросов «утекло» с момента последнего обращения: `drained = elapsed_ms * ratePerMs`
3. Если `count - drained < capacity` — выдаёт токен (инкрементирует count, возвращает `0`)
4. Иначе — возвращает `waitMs` (сколько мс нужно подождать до освобождения слота)

Атомарность Lua исключает race condition между несколькими инстансами приложения.  
TTL ключа — 60 секунд (автоочистка при неактивности портала).

**При ошибке Redis** (обрыв соединения и т.п.) — `acquire()` пропускает запрос без исключения (fail-open).

---

## Цепочка зависимостей

```
BitrixCoreModule
  providers: [BitrixApiFactoryService, BitrixRateLimiterService]

BitrixApiFactoryService (Injectable)
  → constructor(..., private rateLimiter: BitrixRateLimiterService)
  → new BitrixBaseApi(..., rateLimiter)       // передаётся в конструктор plain-класса

BitrixBaseApi (plain class, new)
  → new BitrixCore(..., rateLimiter)

BitrixCore (plain class, new)
  → в request(): await this.rateLimiter.acquire(this.domain)
```

`BitrixRateLimiterService` — `@Injectable()` синглтон, управляется NestJS DI.  
`BitrixBaseApi` и `BitrixCore` — plain-классы, зависимость передаётся через конструктор.

---

## Запуск тестов

```bash
# Запустить только тесты rate limiter
pnpm test --testPathPattern="bitrix-rate-limiter"

# Все тесты
pnpm test
```

> **Примечание по jest:** для работы тестов нужен `moduleNameMapper` в jest-конфиге  
> (`@/` → `<rootDir>/`). Если тесты не находят модули — добавьте в `jest.config.ts`:
> ```ts
> moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' }
> ```

---

## Приоритет менеджеров (с 05.10.2026)

Ведро одно на портал, но слоты из него берутся по **классу вызова**:

| Класс | Кто это | Доступно из ведра | Не дождался слота |
|---|---|---|---|
| `interactive` | HTTP-запросы (менеджер у экрана) и очередь отчётов менеджера | всё ведро (50) | через 15 с запрос уходит без слота |
| `background` | кроны, очереди, вебхуки роботов, AI | 60% ведра (30 из 50) | ждёт до 10 минут, затем отказ `BitrixRateLimitTimeoutError` — мимо очереди фон не ходит |

Фон перестаёт брать слоты, когда счётчик ведра дошёл до его доли: у менеджеров
всегда остаётся запас на всплеск в 20 запросов, какой бы длинной ни была
фоновая работа.

Класс лежит в асинхронном контексте (`@lib/core/call-context`):

- каждый HTTP-запрос помечается интерактивом автоматически (`bootstrapApp`);
- всё, что идёт вне HTTP (кроны, обработчики очередей), — фон по умолчанию;
- ручки, за которыми нет человека (вебхуки роботов, AI-агент, ручной запуск
  крона), помечаются `@BackgroundCalls()`;
- очередь, исполняющая действие менеджера, поднимает класс сама:
  `runAsInteractive('queue:…', () => …)`.

Лимит портала задаётся в его настройках (админка → портал → «Настройки
приложений» → «Портал (общие)»): включение очереди, тариф (обычный — 2 запроса в
секунду и запас 50, энтерпрайз — 5 и 250), доля запаса для фоновых задач в
процентах и сроки ожидания слота для менеджеров и для фона. Не задано —
действуют значения по умолчанию: очередь включена, обычный тариф, фону 60%, менеджер
ждёт 15 с, фон — 10 минут. Настройки доезжают до ограничителя через
`PBXService.init` (кэш минута) вместе с ключом портала.

Метрики (`/api/metrics`): `bitrix_rate_limit_wait_seconds{domain,call_class,outcome}`
— ожидание слота (`granted` / `passed` / `rejected`),
`bitrix_requests_total{domain,method,call_class,result}` и
`bitrix_request_duration_seconds{domain,call_class,result}` — сами обращения.
