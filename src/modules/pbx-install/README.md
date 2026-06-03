# PBX Install — установка и синхронизация конфигурации Bitrix-портала

> Модуль отвечает за **установку и синхронизацию** конфигурации CRM (поля, воронки,
> стадии, смарт-процессы, списки) между тремя источниками:
> **Excel-шаблон → Bitrix24 → PortalDB (БД April)**.
>
> Документ разделён на три части:
> 1. [Для фронтенда](#1-для-фронтенда) — что модуль умеет, что показывать, что обновлять.
> 2. [Для бэкенд-разработчиков](#2-для-бэкенд-разработчиков) — архитектура и границы.
> 3. [План выноса в отдельный app монорепы](#3-план-выноса-в-отдельный-app-монорепы).

---

## 0. Что это за модуль в одном абзаце

Модуль **ничего не хранит сам** и **не является источником истины**. Он знает три внешних API
и приводит их состояние к одному:

- **Excel-шаблон** (`storage/app/install/<group>/...`) — эталон «как должно быть».
- **Bitrix24** — реальная CRM клиента; правится через библиотеку [`modules/bitrix`](../bitrix).
- **PortalDB** (БД April) — зеркало для конструктора/фронта; правится **только** через сервисы
  домена [`modules/pbx-domain`](../pbx-domain) (репозитории/сервисы Portal*-сущностей).

```
            ┌─────────────┐   parse    ┌──────────────┐   sync    ┌──────────────┐
 Excel ───▶ │ pbx-install │ ─────────▶ │   Bitrix24   │ ────────▶ │   PortalDB   │
 шаблон     │  (этот мод) │            │ (modules/    │           │ (modules/    │
            └─────────────┘            │  bitrix lib) │           │  pbx-domain) │
                  │                    └──────────────┘           └──────────────┘
                  └── знает API обоих и синхронизирует состояние ──┘
```

Ключевое: **PortalDB-сущности — это отдельный модуль** (`pbx-domain`), к которому обращаемся
через сервисы; **Bitrix — отдельная библиотека** (`modules/bitrix`). Этот модуль их склеивает.

---

## 1. Для фронтенда

### 1.1. Модель из трёх «глаголов»

Под каждую сущность (Deal / Company / Smart, плюс под-разрезы Field и Category) есть три группы
эндпоинтов с устойчивым паттерном:

| Глагол | Назначение | Что делает фронт |
|--------|------------|------------------|
| **Monitoring** (`GET`) | Только чтение | **Показывать** текущее состояние и предпросмотр шаблона |
| **Install** (`GET`/`POST`) | Создать/обновить | **Обновлять** — заливать шаблон в Bitrix + зеркалить в PortalDB |
| **Manage** (`POST`) | Точечное удаление/правка | Удалять/переименовывать отдельные поля, воронки, стадии, enum-элементы |

> Все mutating-операции **идемпотентны по смыслу**: повторный install обновляет уже
> существующее (upsert), а не плодит дубликаты.

### 1.2. Что показывать (Monitoring)

- **`GET .../domain/:domain`** — смерженное состояние Bitrix + PortalDB по `code`/`bitrixId`.
  Это основной экран «что реально стоит на портале». Подходит для таблицы со статусами
  (есть в Bitrix / есть в БД / расходится).
- **`GET .../parse/...`** — предпросмотр Excel-шаблона (что *будет* установлено). Удобно для
  диалога подтверждения перед установкой.
- **`GET .../search/:domain/:group/:search`** — поиск по подстроке в `code`/`name`/`title`
  шаблона с подложенным состоянием БД/Bitrix. Для строки поиска на экране конфигурации.

### 1.3. Что обновлять (Install)

- **GET-вариант** (`/install/...`) — читает Excel-шаблон и устанавливает. Параметры в пути:
  `domain`, `group` (`sales`/`service`), `appName` (`event`/`konstructor`/`all`) либо
  `categoryName`/`smartName`.
- **POST-вариант** (`/install-fields/`, `/install-categories/`) — то же, но шаблон не читается;
  массив полей/категорий приходит **в теле запроса**. Для повторной установки/синхронизации
  и интеграций, когда фронт сам формирует payload.

### 1.4. Точечная правка (Manage, всегда `POST`)

`delete-fields` / `delete-categories` / `delete-field-item` / `delete-category-stage` /
`edit-field-item` / `edit-category-stage`.

> Многие manage-эндпоинты принимают **`domain: "all"`** — операция применяется ко всем порталам
> сразу (массовые правки конфигурации). На фронте это стоит выделять отдельным «опасным» режимом.

### 1.5. Карта эндпоинтов (Swagger-теги)

> Базовый префикс приложения — `/api`. Ниже пути указаны без него.

**Smart-процессы**
- `PBX Smart Install` (`pbx-smart-install`) — оркестратор смарта целиком:
  - `GET  domain/:domain` — все смарты портала
  - `GET  domain/:domain/smart/:smartName/withBitrix/:withBitrix` — один смарт
  - `GET  install/domain/:domain/smart/:smartName/:group` — **установить смарт** (тип + поля + воронки)
  - `DELETE install/domain/:domain/smart/:smartName/:smartGroup?withBitrix=` — удалить
- `PBX Smart Category Install` (`pbx-smart-category-install`): `install/domain/:domain/smartName/:smartName/group/:group`, `install-categories/`, `delete-categories/`, `delete-category-stage/`, `edit-category-stage/`
- `PBX Smart Category Install Monitoring`: `domain/:domain/smartName/:smartName/group/:group`, `parse/:smartName/:group`, `search/:domain/:smartName/:group/:search`
- `PBX Smart Field Install` (`pbx-smart-field-install`): `install/domain/:domain/smartName/:smartName/group/:group`, `install-fields/`, `delete-fields/`, `delete-field-item/`, `edit-field-item/`
- `PBX Smart Field Install Monitoring` — паттерн `domain` / `parse` / `search` (как у Deal Field)

**Сделки (Deal)**
- `PBX Deal Category Install` (`pbx-deal-category-install`): `install/domain/:domain/group/:group/categoryName/:categoryName`, `install-categories/`, `delete-categories/`, `delete-category-stage/`, `edit-category-stage/`
- `PBX Deal Category Install Monitoring`: `domain/:domain`, `parse/:categoryName/:group`, `search/:domain/:group/:search`
- `PBX Deal Field Install` (`pbx-deal-field-install`): `install/domain/:domain/group/:group/appName/:appName`, `install-fields/`, `delete-fields/`, `delete-field-item/`, `edit-field-item/`
- `PBX Deal Field Install Monitoring`: `domain/:domain`, `parse/:appName/:group`, `search/:domain/:group/:search`

**Компании (Company)**
- `PBX Company Install` (`pbx-company-install`): `install/domain/:domain/group/:group/appName/:appName`, `install-fields/`, `delete-fields/`, `delete-field-item/`, `edit-field-item/`
- `PBX Company Install Monitoring`: `domain/:domain`, `parse/:appName/:group`, `search/:domain/:group/:search`

**Списки (List)** — `pbx-list-install` присутствует, но контроллеры закомментированы → **WIP**, на фронте пока не использовать.

### 1.6. Важные нюансы для UI

- **`categoryName=all` / `appName=all`** — установить весь шаблон сразу; конкретное имя — точечно.
- **`isNeedUpdate`** — поле в Excel-шаблоне: ставятся **только** поля с `isNeedUpdate=true`.
  Если новое поле «не встаёт» — проверьте флаг в шаблоне (это не баг бэка).
- **Долгие операции.** Install целого шаблона делает много вызовов Bitrix (batch + rate-limit),
  ответ может идти десятки секунд — закладывайте прогресс/спиннер и большой таймаут.
- **Ответ install** содержит `bxResult` (что сделано в Bitrix) и `portalFieldEntityInstallResult`
  (что зеркалировано в БД) — удобно для отчёта «успешно/с ошибками».

---

## 2. Для бэкенд-разработчиков

### 2.1. Луковая архитектура (слои)

```
Controller (HTTP, Swagger, DTO)
   └─▶ Use-case (сценарий: резолв сущности портала, фильтры, оркестрация)
          └─▶ Orchestrator service (InstallDealCategoriesService, InstallSmartCategoriesService …)
                 ├─▶ shared install services (переиспользуемое ядро)
                 │      • parse-field-excel  — чтение Excel → типизированные модели
                 │      • entity/field       — поля DEAL/COMPANY через crm.<entity>.userfield.*
                 │      • typed-entity/field — поля Smart/RPA через userfieldconfig.*
                 │      • category           — воронки через crm.category.*
                 │      • stage              — стадии через crm.status.*
                 ├─▶ modules/bitrix          — REST-клиент Bitrix (внешняя библиотека)
                 └─▶ modules/pbx-domain      — репозитории/сервисы PortalDB (внешний модуль)
```

Один сервис — одна ответственность. Оркестраторы «толстые» только там, где сущность
нельзя установить по кускам (например, смарт: `crm.type.add` + upsert в `smarts` обязателен
до установки полей).

### 2.2. Переиспользуемое ядро (`shared/`)

- **`parse-field-excel`** — `ParseFieldsService` / `ParseSmartFieldsService` + утилиты
  (`unwrapExcelCellValue`, `coerceExcelBool`). Excel-ячейки бывают `boolean`/`'true'`/`1`/пусто —
  булевы флаги (`isNeedUpdate`, `isMultiple`, `isActive`) нормализуются через `coerceExcelBool`.
- **`entity/field`** (`BxEntityFieldsInstallService`) — поля для **DEAL/COMPANY** (легаси CRM,
  `crm.deal.userfield.*` / `crm.company.userfield.*`).
- **`typed-entity/field`** (`BxTypedEntityFieldsInstallService`) — поля для **Smart/RPA**
  (`userfieldconfig.*`, другой payload-shape).
- **`category`** (`InstallCategorySyncService`) — воронки `crm.category.*` + зеркало `btx_categories`.
- **`stage`** (`InstallStageSyncService`) — стадии `crm.status.*` + зеркало `btx_stages`.

Различия форматов Bitrix (`ENTITY_ID`, `STATUS_ID`, семантика стадий) вынесены в **стратегии**
(`DealCategoryStageStrategy`, smart-стратегия), которые прокидывает оркестратор — ядро остаётся общим.

### 2.3. Внешние границы (что НЕ принадлежит модулю)

| Зависимость | Что даёт | Как используем |
|-------------|----------|----------------|
| [`modules/bitrix`](../bitrix) | REST-клиент Bitrix, batch, rate-limit | только через инстанс из `PBXService.init(domain)` |
| [`modules/pbx`](../pbx) | `PBXService` — резолв `{ bitrix, portal }` по `domain` | единственный владелец инстанса Bitrix |
| [`modules/pbx-domain`](../pbx-domain) | PortalDB: `PortalDealService`, `PortalCompanyService`, `PortalSmartService`, `BtxCategoryRepository`, `BtxStageRepository`, `PbxFieldService` … | вся работа с БД April только через них |
| `core/storage` | Excel-шаблоны установки | `StorageService` |

### 2.4. Обязательные правила работы с Bitrix (из CLAUDE.md / BITRIX_DOMAIN_MODULE_GUIDE)

- Инстанс Bitrix получаем **только** через `const { bitrix } = await this.pbxService.init(domain)`.
  В `@Injectable()`-сервисах **нельзя** держать `this.bitrix` — иначе race condition между доменами.
  Либо локальная переменная, либо `new SomeService(bitrix)`.
- **Batch.** Накопление и отправка batch-команд должны идти через **один и тот же** инстанс
  (`bitrix.batch.*` накапливает → `bitrix.api.callBatchWithConcurrency()` отправляет).
- Недостающие методы Bitrix добавляются в библиотеку `modules/bitrix` по MCP-документации API.

### 2.5. Прочие знаковые места

- **Удаление стадий толерантно к 400** (`InstallStageSyncService.deleteStatusForced`): системные
  стадии Bitrix не удаляются — пропускаем, не роняя установку.
- **Установка воронок не удаляет «чужие»** воронки портала (нет orphan-чистки) — точечная
  установка не сносит остальные funnel-ы клиента.
- **Gating полей** — по `field.isNeedUpdate`; enum-элементы берутся «все активные» (`isActive` + `del≠Y`).
- **BigInt в ответах** — `id` из Prisma сериализуются строкой через глобальный
  `BigInt.prototype.toJSON` в [`src/main.ts`](../../main.ts).

### 2.6. Тесты

При доработке модуля покрывать тестами места возможных ошибок (парсинг Excel, маппинг типов,
batch-результаты, толерантность к ошибкам Bitrix). Код тестов и рабочий код не смешивать.
После правок: `pnpm run lint`.

---

## 3. План выноса в отдельный app монорепы

Цель: `pbx-install` — это **отдельно деплоящийся NestJS-сервис** (`apps/pbx-install`),
а общий код (Bitrix-клиент, доступ к PortalDB, PBXService, Prisma, утилиты) — в `libs/`.

### 3.1. Целевая топология (Nest monorepo)

```
apps/
  api/                     # текущий монолит (то, что осталось)
  pbx-install/             # новый сервис установки/синхронизации
    src/
      main.ts              # bootstrap + BigInt patch + Swagger
      app.module.ts        # импортирует PBXInstallModule + нужные libs
libs/
  bitrix/                  # ← modules/bitrix
  pbx/                     # ← modules/pbx (PBXService)
  pbx-domain/              # ← modules/pbx-domain (доступ к PortalDB)
  prisma/                  # PrismaService + сгенерированный клиент
  shared/                  # утилиты, enums, фильтры, интерсепторы (ResponseInterceptor)
```

Принцип: **app зависит только от libs**, libs друг от друга — по направленному графу
без циклов (`pbx-install` → `pbx-domain`/`bitrix`/`pbx` → `prisma`/`shared`).

### 3.2. Что должно стать shared-библиотеками

Уже сейчас `pbx-install` зависит от: `PBXModule`, `PortalStoreModule`, `PortalDealModule`,
`PortalCompanyModule`, `PortalSmartModule`, `PortalCategoryModule`, `PbxFieldModule`,
`BtxCategory/BtxStage`, `ParseFieldExcelModule`, `core/storage`, `RedisService`,
`TelegramService`, Prisma. Все они → `libs/` (или остаются в общем `libs/pbx-domain`).

### 3.3. Развязка по данным (главное архитектурное решение)

`pbx-install` пишет в PortalDB (`btx_categories`, `btx_stages`, поля). Два пути:

1. **Shared DB-доступ (быстрый старт).** `apps/pbx-install` использует тот же `libs/prisma` +
   `libs/pbx-domain` и ходит в ту же БД напрямую. Минимум переписывания, но связность по схеме БД.
2. **Контракт через API/очередь (чистый микросервис).** PortalDB остаётся за монолитом,
   `pbx-install` обращается к нему по HTTP/брокеру. Чище, но требует контрактов и больше работы.

> ⚠️ Миграции БД — **отдельный проект** (этот сервис делает только `pull`). Любой вариант
> не должен порождать миграции отсюда. Решение (1 vs 2) принять до начала выноса.

### 3.4. Пошаговый план (strangler-подход)

1. **Инвентаризация зависимостей** (граф импортов `pbx-install` → внешние модули) — уже частично
   собрана в §2.3 / §3.2. Зафиксировать список и проверить отсутствие обратных зависимостей
   (никто из «общего» не импортирует `pbx-install`).
2. **Конфиг монорепы.** `nest-cli.json` → `projects` (apps + libs), `tsconfig` path-aliases
   (`@app/bitrix`, `@app/pbx-domain` …), общий `eslint`/`prettier`.
3. **Выделить libs.** Перенести `modules/bitrix`, `modules/pbx`, `modules/pbx-domain`, prisma,
   `core/storage`, `shared`-утилиты в `libs/`, обновить импорты на алиасы. Делать по одному
   модулю, держа монолит зелёным.
4. **Создать `apps/pbx-install`.** Свой `main.ts` (перенести `BigInt.prototype.toJSON`,
   `ValidationPipe`, `ResponseInterceptor`, `GlobalExceptionFilter`, Swagger, CORS, body limits),
   `AppModule` импортирует `PBXInstallModule`.
5. **Перенести сам модуль** `pbx-install` в app как корневой feature-модуль (код почти не меняется,
   меняются только пути импортов на алиасы libs).
6. **Инфраструктура.** Env (домены/вебхуки Bitrix, Redis, Telegram, БД), общий `PrismaService`,
   `BitrixRateLimiterService`/семафор — проверить, что rate-limit и кэш портала работают
   в отдельном процессе (Redis как общий стор для координации лимитов между сервисами).
7. **Сеть/маршрутизация.** Решить, как фронт ходит в новый сервис: отдельный домен/порт или
   reverse-proxy на тех же путях `/api/pbx-*`. Префикс `/api` сохранить для совместимости.
8. **Сборка/деплой.** Отдельный `Dockerfile`/таргет, CI-пайплайн на `apps/pbx-install`,
   независимый релиз.
9. **Тесты.** Перенести/добавить unit на ядро (`shared`), smoke-e2e на ключевые install/monitoring
   эндпоинты против стенда.
10. **Постепенный переезд (strangler).** Поднять новый сервис параллельно, перенаправить трафик
    `pbx-*` на него через прокси, убедиться в паритете, затем удалить модуль из монолита.

### 3.5. Риски и на что смотреть

- **Координация rate-limit/семафора Bitrix** между процессами — общий Redis обязателен,
  иначе два сервиса независимо упрутся в лимиты портала.
- **Кэш портала** (`PortalService` «Returning cached portal») — единый источник/инвалидация.
- **Per-domain инстанс Bitrix + batch** (§2.4) — при выносе ничего не «шарить» между запросами.
- **Связность по схеме PortalDB** — зафиксировать §3.3 заранее.
- **Совместимость API** — пути и форматы ответов (`ResponseInterceptor`, BigInt-как-строка)
  не должны измениться при переезде.

---

_Поддерживается командой April. При изменении эндпоинтов/архитектуры — обновляйте этот файл
вместе с кодом._
