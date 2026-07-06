# @lib/metrics — метрики приложений (Prometheus)

Общая библиотека метрик для всех приложений `apps/*`. Одна строка в корневом
модуле — и приложение отдаёт `GET /api/metrics` в формате Prometheus:
системные метрики Node.js + HTTP-метрики всех запросов (автоматически, через
глобальный интерсептор).

Полный гайд по метрикам (Prometheus, Grafana, дашборды, PromQL, прод):
[docs/METRICS.md](../../docs/METRICS.md). Логи — отдельная система:
[@lib/logger](../logger/README.md) / [docs/LOGGING.md](../../docs/LOGGING.md).

## Подключение

```ts
import { MetricsModule } from '@lib/metrics';

@Module({
    imports: [
        ConfigModule.forRoot({ ... }),
        MetricsModule.forRoot({ appName: '<app>' }), // метка app на всех метриках
        ...
    ],
})
```

Все 11 приложений уже подключены. Больше ничего не требуется — интерсептор
регистрируется глобально сам (APP_INTERCEPTOR).

## Что даёт из коробки

| Метрика | Метки | Что показывает |
|---|---|---|
| `http_requests_total` | `method, route, status` (+`app, env`) | счётчик всех HTTP-запросов |
| `http_requests_errors_total` | `method, route` | счётчик запросов, завершившихся исключением |
| `http_request_duration_seconds` | `method, route` | гистограмма длительности (p50/p95/p99) |
| `nodejs_*`, `process_*` | | heap, event loop lag, CPU, дескрипторы (defaultMetrics prom-client) |

Особенности:

- **В метку идёт шаблон роута** (`/api/deal/:id`), а не реальный URL — иначе
  каждый id создавал бы новый временной ряд и раздувал память Prometheus
  (кардинальность). Это сделано в [metrics.interceptor.ts](src/metrics.interceptor.ts).
- **`/api/metrics` открыт** (`@Public()` из `@lib/auth`) — Prometheus сможет
  скрейпить даже при включённой авторизации ([metrics.controller.ts](src/metrics.controller.ts)).
  Сам эндпоинт в метриках не учитывается.
- Метки `app`/`env` вешаются на все метрики (defaultLabels) — в Prometheus
  приложения не смешиваются.
- Память процесса не растёт: метрики — это фиксированный набор счётчиков
  в памяти (сотни чисел), не накопление событий.

## Свои метрики в приложении

Регистр prom-client общий, поэтому достаточно провайдера в своём модуле:

```ts
// в providers модуля фичи:
import { makeCounterProvider } from '@willsoto/nestjs-prometheus';

makeCounterProvider({
    name: 'deals_processed_total',
    help: 'Обработанные сделки',
    labelNames: ['result'],   // мало значений! ok|failed, НЕ dealId
}),
```

```ts
// в сервисе:
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

constructor(
    @InjectMetric('deals_processed_total')
    private readonly dealsProcessed: Counter<string>,
) {}

this.dealsProcessed.labels('ok').inc();
```

Виды метрик, когда какую брать, примеры продуктовых метрик и правила меток —
[docs/METRICS.md](../../docs/METRICS.md#какие-бывают-метрики).

⚠️ Главное правило: **в метки — только значения с малым числом вариантов**
(статус, тип, результат). Никогда не клади в метку id, домен, email — каждый
уникальный набор меток = отдельный временной ряд в памяти.

## Тесты

```bash
npx jest libs/metrics
```

Покрыто: учёт запросов с шаблоном роута, ограничение кардинальности, 404 без
роута, исключения (HttpException/generic), пропуск `/metrics` и не-HTTP
контекстов, замер длительности.
