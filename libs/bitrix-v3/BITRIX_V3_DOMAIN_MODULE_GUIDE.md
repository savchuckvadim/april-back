# Bitrix V3 Domain Module Guide

Стандарт добавления методов Bitrix24 **REST API 3.0** в библиотеку `@lib/bitrix-v3`.

Библиотека полностью независима от `@lib/bitrix` (v1/v2). Единственная связь —
общий `BitrixRateLimiterService` (лимиты Битрикса на портал общие для всех версий API,
квоту делит один leaky bucket в Redis).

## 1) Ключевые отличия от v1-библиотеки

| | `@lib/bitrix` (v1) | `@lib/bitrix-v3` |
|---|---|---|
| Идентификация метода | 3 енума (`EBxNamespace` + `EBXEntity` + `EBxMethod`) | **строка метода как в API**: `'humanresources.node.list'` |
| URL | `/rest/{id}/{hook}/{method}` | `/rest/api/{id}/{hook}/{method}` |
| Формат ответа | зависит от метода | всегда `{ result, time }`, ошибки — `{ error: { code, message, validation } }` |
| Слой repository | обязателен | **нет** — сервис зовёт типизированный `api.call` напрямую |
| Batch | накопительный стейт в инстансе | **нет by design** (`Promise.all` + семафор); эндпоинт `/batch` появится позже как stateless-метод |
| Клонирование сервисов | `ServiceClonerFactory` + `init()` | обычный `new` в конструкторе `BitrixV3Service` |
| Ошибки | сырой axios | типизированный `BitrixV3ApiError` (`code`, `validation`, `method`, `httpStatus`) |

## 2) Как устроена типизация

Единая карта методов — [src/core/schema/bx-v3-method-map.ts](src/core/schema/bx-v3-method-map.ts):

```ts
export interface BxV3MethodMap extends HrNodeMethods, HrNodeMemberMethods, HrEmployeeMethods {}
```

Ключ карты — строка метода (она же path OpenAPI-спеки без ведущего слэша),
значение — `{ request, response }`. Транспорт выводит типы из строки-литерала:

```ts
const { items } = await api.call('humanresources.node.list', { type: EBxHrNodeType.TEAM });
const { item } = await api.call(HR_NODE.GET, { id: 57, select: ['members'] });
```

Опечатка в имени метода или неверные params — ошибка компиляции.

## 3) Структура доменного модуля

```
src/domain/<domain>/
├── interfaces/<domain>.interface.ts   — типы сущностей (интерфейсы, не классы)
├── <entity>/
│   ├── schema/<entity>.schema.ts      — константы методов + interface XxxMethods
│   └── services/bx-<entity>.service.ts — сервис сущности (НЕ injectable)
├── __tests__/                         — тесты на мокнутом CallV3ApiService
└── index.ts                           — barrel-экспорт
```

Repository-слоя нет: типизированный `CallV3ApiService.call` уже является
low-level слоем.

## 4) Порядок добавления нового метода/домена

### Шаг 1. Проверить реальную форму ответа

Спека и markdown-доки Битрикса местами врут (см. раздел 7). Перед описанием
типов вызови метод на живом портале (`api.callRaw`) или сверься со снапшотом
`openapi/bitrix-v3.openapi.json` + доками
[apidocs.bitrix24.ru](https://apidocs.bitrix24.ru/api-reference/rest-v3/).

### Шаг 2. Интерфейсы сущностей

`interfaces/<domain>.interface.ts` — строгие типы данных. Только `interface`/`type`/`enum`,
никаких классов (совместимость с будущим codegen). `any` запрещён.

### Шаг 3. Схема методов

```ts
// schema/some-entity.schema.ts
export const SOME_ENTITY = {
    LIST: 'namespace.entity.list',
    GET: 'namespace.entity.get',
} as const;

export interface SomeEntityMethods {
    'namespace.entity.list': {
        request: { /* параметры */ pagination?: IBitrixV3Pagination };
        response: { items: ISomeEntity[] };
    };
    'namespace.entity.get': {
        request: { id: number };
        response: { item: ISomeEntity };
    };
}
```

Правила:
- ключ = строка метода **без** ведущего слэша;
- `response` — тип **распакованного** `result` (без обёртки `{result, time}`);
- списочные методы называй с `items: [...]` и `pagination?` в request —
  тогда метод автоматически попадает в `BxV3ListMethod` и работает `api.callAll`.

### Шаг 4. Подключить схему в карту (одна строка)

```ts
// src/core/schema/bx-v3-method-map.ts
export interface BxV3MethodMap
    extends HrNodeMethods, ..., SomeEntityMethods {}
```

### Шаг 5. Сервис сущности

```ts
export class BxSomeEntityService {
    constructor(private readonly api: CallV3ApiService) {}

    async getById(id: number): Promise<ISomeEntity> {
        const { item } = await this.api.call(SOME_ENTITY.GET, { id });
        return item;
    }
}
```

- НЕ `@Injectable` — инстанс живёт внутри `BitrixV3Service` конкретного портала;
- строковые методы вне схемы в бизнес-коде запрещены; `api.callRaw` — только
  временно, до описания метода в схеме;
- композиции нескольких вызовов — `Promise.all` (параллельность ограничивает
  семафор транспорта).

### Шаг 6. Подключить сервис в фасад

В [src/bitrix-v3.service.ts](src/bitrix-v3.service.ts) добавить поле
(`readonly`, создаётся в конструкторе через `new`):

```ts
public readonly someDomain: { entity: BxSomeEntityService };
```

### Шаг 7. Экспорты и тесты

- `domain/<domain>/index.ts` + `domain/index.ts`;
- тесты в `__tests__` на мокнутом `CallV3ApiService` (см.
  [bx-hr-node.service.spec.ts](src/domain/humanresources/__tests__/bx-hr-node.service.spec.ts));
- `pnpm run lint`, `npx jest libs/bitrix-v3`.

## 5) Использование в приложениях

```ts
// модуль приложения
imports: [BitrixV3Module]

// сервис
constructor(private readonly bitrixV3Factory: BitrixV3ServiceFactory) {}

const bitrixV3 = this.bitrixV3Factory.create({ domain, webhook });
const teams = await bitrixV3.hr.node.getTeams();
const tree = await bitrixV3.hr.node.getSubtreeWithMembers(teamId);
```

**ВАЖНО (как и в v1):** нельзя хранить инстанс `BitrixV3Service` в `this`
`@Injectable`-сервиса — race condition между порталами. Инстанс создаётся
на каждый запрос по domain.

## 6) Кодогенерация из OpenAPI

REST 3.0 отдаёт автогенерируемую OpenAPI-спеку (метод `documentation`).

```bash
# 1. Обновить снапшот openapi/bitrix-v3.openapi.json (секреты в файл не попадают)
BITRIX_V3_SPEC_DOMAIN=portal.bitrix24.ru BITRIX_V3_SPEC_WEBHOOK=rest/1/token pnpm run bitrix-v3:spec

# 2. Перегенерировать src/generated/openapi.ts (по умолчанию неймспейс humanresources)
pnpm run bitrix-v3:codegen
BITRIX_V3_CODEGEN_PREFIXES=humanresources,tasks pnpm run bitrix-v3:codegen
```

Связь с рукописной схемой: **ключ `BxV3MethodMap` = path спеки без слэша**.
Адаптер [src/generated/openapi-adapter.type.ts](src/generated/openapi-adapter.type.ts)
позволяет взять типы метода прямо из спеки:

```ts
interface SomeMethods {
    'humanresources.node.communication.list':
        TBxV3GenEntryByMethod<'humanresources.node.communication.list'>;
}
```

Когда Битрикс доведёт спеку до ума, домены можно переводить на сгенерированные
типы пофайлово — сервисы и транспорт не меняются.

## 7) Известные проблемы спеки/доков Битрикса (проверено 07.2026)

- в спеке `node.list` `result` описан как массив, **реально** — `{ items: [...] }`;
- в схемах нет enum'ов (`type: string` вместо `DEPARTMENT|TEAM`), `members` — нетипизированный массив, nullability не размечена;
- `filter` в `node.list` заявлен в спеке, но живым порталом **игнорируется** (возвращается полный список);
- обязательный `type` у `node.list`/`node.search` в request-схеме спеки не помечен;
- `/batch` в спеке без схемы и без документации.

Поэтому: сгенерированные типы — справочные; источник правды — рукописные
схемы, сверенные с живыми ответами портала.

## 8) Транспорт: что уже решено в core

- URL: вебхук `https://{domain}/rest/api/{id}/{token}/{method}`, OAuth — `auth` в теле;
- только JSON POST (`Content-Type: application/json`);
- ретраи: таймаут, HTTP 503, коды `*LIMIT*` (пауза 35с);
- семафор на 10 параллельных запросов + общий с v1 rate limiter (leaky bucket в Redis по домену);
- алерты — только `Logger` (`@lib/logger` сам доставляет в Telegram, прямой зависимости от `@lib/telegram` нет).
