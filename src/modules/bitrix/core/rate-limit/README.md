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

В `.env`:

```env
# Включить rate limiter (по умолчанию ВЫКЛЮЧЕН)
BITRIX_RATE_LIMIT_ENABLED=true

# Тариф портала: regular | enterprise (по умолчанию regular)
BITRIX_PLAN=regular
```

**При `BITRIX_RATE_LIMIT_ENABLED != 'true'`** метод `acquire()` возвращается мгновенно без обращения к Redis — поведение идентично тому, что было до введения rate limiter.

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
