# @lib/app-cache — центральный кэш монорепы

Write-through кэш **Redis + MySQL** (таблица `app_cache`): Redis — горячий слой,
БД — источник истины. Пишем всегда в оба; читаем из Redis, на промахе
(перезагрузили Redis) поднимаем из БД и регидрируем. Хранить можно **что угодно**
сериализуемое в JSON.

## Подключение

```ts
// root-модуль приложения
imports: [
    AppCacheModule,        // сервис (глобально) + эндпоинты инспекции /app-cache/*
    // или AppCacheServiceModule — только сервис, без контроллера в Swagger
]
```

`AppCacheService` после этого инжектится в любом модуле приложения без импортов
(`@Global`). Нужны `PrismaModule` (@Global, обычно уже есть) и Redis-конфиг.

## Использование

```ts
constructor(private readonly cache: AppCacheService) {}

// адрес записи: app (пространство фичи) + домен портала + key (+ bxUserId)
await this.cache.set({
    app: 'my-feature',
    domain: 'gsr.bitrix24.ru',
    key: 'report:2026-07',
    group: 'report',          // для пакетного сброса/инспекции
    data: anything,           // любой JSON
    ttlSeconds: 3600,         // не указан — бессрочно (истина в БД)
});

const value = await this.cache.get<MyType>({ app, domain, key });

// Laravel-style: вернуть из кэша или вычислить и положить
const report = await this.cache.remember(
    { app: 'my-feature', domain, key, ttlSeconds: 900 },
    () => heavyCompute(),
);

await this.cache.delete({ app, domain, key });
await this.cache.reset({ app: 'my-feature', domain });      // пакетно
```

### Пакетные операции (getMany / setMany)

Для потребителей с сотнями мелких ячеек (например месячные ячейки
airtime — «домен × сотрудник × месяц») поштучный get дал бы сотни
roundtrip'ов. Пакетные методы делают это за константное число запросов:

```ts
// Redis MGET одним вызовом; промахи — один findMany на пару портал+app,
// с регидрацией Redis pipeline'ом. Порядок результата = порядку refs.
const cells = await this.cache.getMany<MyCell>(
    userIds.map(id => ({ app: 'airtime', domain, key: `u${id}:2026-06` })),
);

// Upsert'ы одной prisma-транзакцией + Redis pipeline.
await this.cache.setMany(entries);
```

Живой пример: `apps/kpi-report-sales/src/airtime/cache/airtime-cache.service.ts`
(типизированные ключи — `airtime-cache-key.util.ts`).

## Эндпоинты инспекции (`AppCacheModule`)

| Ручка | Что делает |
|---|---|
| `POST /app-cache/list` | список записей под фильтром (app/domain/group/keyPrefix), с флагом `inRedis` |
| `POST /app-cache/entry` | запись целиком (по id или адресу) |
| `POST /app-cache/set` | записать (write-through) — можно дёргать и с фронта |
| `POST /app-cache/delete` | удалить запись |
| `POST /app-cache/reset` | пакетный сброс БД+Redis (фильтры app/domain/group/keyPrefix/keySuffix) |
| `POST /app-cache/purge-expired` | почистить протухшие строки БД |

Протухшие строки БД чистятся и кроном (раз в час, если в приложении есть
`ScheduleModule.forRoot()`).

## Схема

- БД: `app_cache`, uuid PK, уникальность `(portal_id, app, key, bx_user_id)`,
  `data JSON`, `checksum` (md5), `group`/`tags`/`meta`, `expired_at`.
- Redis: `app-cache:{app}:{domain}:{bxUserId}:{key}`, TTL = `expired_at`
  (бессрочные — регидрируемые 6 часов).
- `bxUserId = 0` — портальный кэш, общий для всех пользователей.

Куда внедрять по монорепе — см. [INTEGRATION-TARGETS.md](./INTEGRATION-TARGETS.md).
