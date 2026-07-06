# @lib/logger — централизованный логгер монорепо

Общая библиотека логирования для всех приложений `apps/*`. Один раз подключается
в корневой модуль приложения — и **весь** существующий код, который пишет через
`new Logger(X.name)` из `@nestjs/common`, автоматически идёт через неё
(ничего в сервисах менять не нужно).

Полный гайд по всей системе логов (ClickHouse, прод-деплой, запросы) —
[docs/LOGGING.md](../../docs/LOGGING.md).

## Зачем

- **Метки на каждой записи**: `app` (имя приложения) и `env` (NODE_ENV) — в
  общем хранилище логи 11 приложений не смешиваются.
- **Управление через env**: уровень (`LOG_LEVEL`), полное отключение
  (`LOGS_ENABLED=false`), без пересборки.
- **Транспорты**: консоль (всегда), Telegram (ошибки — опционально),
  ClickHouse (история с TTL — опционально).
- **Кастомные поля** (`meta`): любой атрибут (`xo`, `domain`, `dealId`...) в
  записи, по нему можно фильтровать в ClickHouse.

## Как работает

```
new Logger('MyService')  ──►  Nest Logger (глобальный)
                                   │  app.useLogger(AppLoggerService)
                                   ▼
                          AppLoggerService (winston)
                          defaultMeta: { app, env }
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        ▼                          ▼                           ▼
  Console (всегда)          TelegramTransport          ClickHouseTransport
  dev: цветная строка       LOG_TELEGRAM_LEVEL=error   LOG_CLICKHOUSE_ENABLED=true
  prod: JSON-line           троттлинг 20 msg/мин       батчи 500 шт / 5 сек,
                                                       fail-open, буфер ≤ 5000
```

Ключевые файлы:

- [app-logger.service.ts](src/app-logger.service.ts) — `LoggerService` для Nest,
  разбор параметров (context/trace/meta), форматы вывода.
- [logger.module.ts](src/logger.module.ts) — `@Global()` `LoggerModule.forRoot()`,
  сборка транспортов из env.
- [config/logger.config.ts](src/config/logger.config.ts) — парсинг env
  (`buildLoggerConfig`, `buildClickHouseConfig`), уровни.
- [transports/telegram.transport.ts](src/transports/telegram.transport.ts),
  [transports/clickhouse.transport.ts](src/transports/clickhouse.transport.ts).
- Тесты: [src/\_\_tests\_\_/](src/__tests__/).

## Подключение в приложении (2 строки)

Все 11 приложений уже подключены. Для **нового** приложения:

**1. Корневой модуль** (`apps/<app>/src/*.module.ts`):

```ts
import { LoggerModule } from '@lib/logger';

@Module({
    imports: [
        ConfigModule.forRoot({ ... }),          // ConfigModule первым — он грузит .env
        LoggerModule.forRoot({ appName: '<app>' }), // метка app в каждой записи
        ...
    ],
})
```

**2. main.ts** — если приложение использует общий `bootstrapApp` из `@lib/core`,
больше ничего не нужно (он сам делает `useLogger` + fallback). Для кастомного
main.ts (как у `apps/back`):

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(AppLoggerService));
app.flushLogs();
app.enableShutdownHooks(); // обязательно: дожим ClickHouse-буфера на SIGTERM
```

## Использование в коде

Обычный Nest-логгер, ничего специального:

```ts
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DealService {
    private readonly logger = new Logger(DealService.name); // context = 'DealService'

    async process(dealId: number) {
        this.logger.log('сделка обработана');            // уровень log (хранится как info)
        this.logger.warn('подозрительная сумма');
        this.logger.debug({ raw: payload });             // объект-сообщение → JSON
        try { ... } catch (e) {
            this.logger.error(e);                        // Error: message + stack(trace) сами
        }
    }
}
```

### Кастомные поля (характеристики) — meta

Любой **объект**, переданный параметром после сообщения, сливается в поле `meta`
записи. По этим полям потом фильтруются логи в ClickHouse:

```ts
this.logger.log('сделка обработана', { xo: 'x77', dealId: 42, domain });
// prod-вывод: {"level":"info","message":"сделка обработана","app":"back",
//              "env":"production","context":"DealService",
//              "meta":{"xo":"x77","dealId":42,"domain":"april.ru"}, ...}
```

Правила сборки meta:

| Что передали | Куда попадёт |
|---|---|
| объект `{ xo: 'x77' }` | сливается в `meta` (несколько объектов — мержатся) |
| строка последним параметром | `context` (конвенция Nest — так работает `new Logger('Ctx')`) |
| строка перед context у `error()` | `trace` (stack) |
| число/массив/прочее | `meta.params: [...]` |
| `Error` первым аргументом | `message` = err.message, `trace` = err.stack |
| `{ telegram: true }` | reserved-проп: форс-отправка ЭТОЙ записи в Telegram; в meta/ClickHouse не попадает |

### Точечная отправка в Telegram

Глобальный `LOG_TELEGRAM_LEVEL` не обязателен: можно слать в Telegram только
из нужного места кода — любой уровень, независимо от глобальной настройки:

```ts
// уйдёт в Telegram даже при LOG_TELEGRAM_LEVEL=none
this.logger.warn('лимит тарифа почти исчерпан', { telegram: true, domain });
```

Требование одно: приложение должно импортировать `TelegramModule` (иначе
sink отсутствует и флаг молча игнорируется). Троттлинг (20/мин) действует
и на форс-отправки.

Фильтрация в ClickHouse по кастомному полю:

```sql
SELECT timestamp, app, message, meta
FROM logs.app_logs
WHERE JSONExtractString(meta, 'xo') = 'x77'
ORDER BY timestamp DESC LIMIT 100;
```

Если по полю фильтруете постоянно и данных много — заведите под него
материализованную колонку (см. [docs/LOGGING.md](../../docs/LOGGING.md#кастомные-поля)).

## Конфигурация (env)

Читается из окружения приложения (`apps/<app>/.env` перекрывает корневой `/.env`):

| Переменная | Значения | Дефолт | Описание |
|---|---|---|---|
| `LOG_LEVEL` | `error\|warn\|log\|debug\|verbose\|silent` | prod→`log`, dev→`debug` | минимальный уровень |
| `LOGS_ENABLED` | `true\|false` | `true` | `false` = выключить всё (равно `silent`) |
| `LOG_TELEGRAM_LEVEL` | `error\|none` | `none` | слать ошибки в Telegram |
| `LOG_CLICKHOUSE_ENABLED` | `true\|false` | `false` | писать в ClickHouse |
| `CLICKHOUSE_URL` | url | — | `http://clickhouse:8123` в docker-сети |
| `CLICKHOUSE_DB` / `_USER` / `_PASSWORD` | | `logs`/`default`/`''` | доступ |
| `LOG_CH_FLUSH_MS` | число > 0 | `5000` | интервал сброса батча |
| `LOG_CH_MAX_BATCH` | число > 0 | `500` | размер батча для немедленного сброса |

## Особенности и грабли

- **Telegram**: транспорт использует `TelegramService` из `@lib/telegram` через
  optional-inject. Если приложение не импортирует `TelegramModule` — транспорт
  просто не создаётся (не ошибка). Троттлинг 20 сообщений/мин — взрыв ошибок
  не зафлудит чат. Ошибки на уровне `error` дублируются и
  `GlobalExceptionFilter`-ом — поэтому дефолт `none`.
- **ClickHouse fail-open**: недоступный ClickHouse НЕ роняет и не тормозит
  приложение — батч дропается с `console.error`, буфер ограничен 5000 записей
  (drop-oldest). Логи за время простоя CH теряются — это осознанный трейд-офф.
- **Никакой рекурсии**: внутренние ошибки транспортов пишутся только в
  `console.error`, не через логгер.
- **`bufferLogs` + `flushLogs`**: логи, случившиеся до `useLogger` (старт DI),
  не теряются — копятся и выводятся уже через наш логгер.
- **`enableShutdownHooks` обязателен** там, где включён ClickHouse: без него
  на SIGTERM (docker stop / деплой) хвост буфера (до 5 сек логов) потеряется.
- Nest-уровень `log` хранится/выводится как **`info`** (конфликт с методом
  `winston.log` + каноничное имя для хранилищ). В `LOG_LEVEL` пишется по-nest-овски: `log`.
- Уровни по убыванию: `error > warn > log(info) > debug > verbose`
  (`LOG_LEVEL=warn` пропустит только error и warn).
- Библиотеку НЕ импортировать из `@lib/telegram` (будет цикл: logger → telegram).

## Тесты

```bash
npx jest libs/logger
```

Покрыто: парсинг env/дефолты, фильтрация уровней, метки, разбор
context/trace/meta, гейтинг и троттлинг Telegram, батчинг/fail-open/переполнение/
dispose ClickHouse-транспорта.
