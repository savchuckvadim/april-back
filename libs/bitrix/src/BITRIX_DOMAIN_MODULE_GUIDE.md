# Bitrix Domain Module Guide

Этот документ фиксирует единый стандарт, как в проекте добавлять новые Bitrix REST методы в строготипизированном виде.

## 1) Принцип декомпозиции метода

Любой Bitrix REST метод разбивается на 3 части:

- `EBxNamespace` - префикс пространства (`crm`, `im`, `im.v2`, ...)
- `EBXEntity` - сущность (`deal`, `message`, `activity.todo`, `Event`, ...)
- `EBxMethod` - операция (`get`, `list`, `add`, `subscribe`, ...)

Примеры:

- `crm.activity.todo.add` -> `CRM` + `ACTIVITY_TODO` + `ADD`
- `im.dialog.messages.get` -> `IM` + `DIALOG_MESSAGES` + `GET`
- `im.v2.Event.subscribe` -> `IMV2` + `EVENT` + `SUBSCRIBE`

## 2) Обязательная структура домена

Для каждой новой сущности создаем одинаковый набор файлов:

- `interface/*.interface.ts` - вход/выход метода(ов)
- `schema/*.schema.ts` - соответствие `EBxMethod -> { request, response }`
- `repository/*.repository.ts` - low-level вызовы `callType`/`addCmdBatchType`
- `services/*.service.ts` - обычный сервис
- `services/*.batch.service.ts` - batch-сервис
- `*.module.ts` - экспорт сервисов наружу
- `index.ts` - barrel-экспорт

Это обязательный минимум, чтобы код был предсказуемым во всех доменах.

## 3) Порядок подключения нового метода

### Шаг 1. Обновить enum'ы

- добавить namespace в `core/domain/consts/bitrix-api.enum.ts` (если нужен новый)
- добавить entity в `core/domain/consts/bitrix-entities.enum.ts`
- добавить method в `core/domain/consts/bitrix-api.enum.ts` (если нет существующего)

### Шаг 2. Описать интерфейсы

Создать строгие request/response типы в `interface`.

Правило:

- request содержит только поля REST метода
- response отражает реальный ответ Bitrix (минимум нужных полей)

### Шаг 3. Добавить schema

В `schema/*.schema.ts` описать карту:

- ключ: `EBxMethod.*`
- значение: `{ request, response }`

### Шаг 4. Добавить repository

В repository использовать только типизированные вызовы:

- `bxApi.callType(namespace, entity, method, data)`
- `bxApi.addCmdBatchType(cmd, namespace, entity, method, data)`

Никаких строковых методов внутри бизнес-кода (`'crm.xxx.yyy'`) быть не должно.

### Шаг 5. Добавить service + batch service

- `service` - обычные вызовы
- `batch service` - накопление batch команд

### Шаг 6. Обновить общую схему API

В `core/domain/schema/bitirix-api.schema.ts`:

- импортировать `*Schema` нового домена
- добавить в `BXApiSchema` по соответствующему namespace/entity

### Шаг 7. Обновить экспорты

- `domain/<group>/index.ts`
- при необходимости агрегирующие модули (`bx-crm-domain.module.ts`, `bx-chat-domain.module.ts`)

### Шаг 8. Обновить `bitrix.service.ts`

Добавить:

- поле обычного сервиса (`bitrix.<domain>`)
- поле batch-сервиса (`bitrix.batch.<domain>`)
- `init<Domain>()` и вызов в `init()`

После этого модуль доступен снаружи единообразно:

- `bitrix.activityTodo.add(...)`
- `bitrix.imV2Event.get(...)`
- `bitrix.batch.dialogMessage.get(...)`

## 4) Шаблон репозитория

```ts
export class SomeRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(data: SomeGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.SOME_ENTITY,
            EBxMethod.GET,
            data,
        );
    }

    getBtch(cmdCode: string, data: SomeGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.SOME_ENTITY,
            EBxMethod.GET,
            data,
        );
    }
}
```

## 5) Реализованные эталонные домены

В рамках текущего рефакторинга добавлены:

- `crm.activity.todo` (todo activity):
  - `BxActivityTodoService`
  - `BxActivityTodoBatchService`
- `im.dialog.messages.get`:
  - `BxDialogMessageService`
  - `BxDialogMessageBatchService`
- `im.v2.Event.subscribe/get`:
  - `BxImV2EventService`
  - `BxImV2EventBatchService`

## 6) Как использовать в командах

### Bridge (IM)

- подписка: `bitrix.imV2Event.subscribe({})`
- polling: `bitrix.imV2Event.get({ limit, offset })`
- загрузка текста: `bitrix.dialogMessage.get({ DIALOG_ID, LIMIT })`
- отправка ответа: `bitrix.message.add({ DIALOG_ID, MESSAGE, REPLY_ID, ... })`

### Missed calls todo

- создание todo: `bitrix.batch.activityTodo.add(cmd, payload)`

## 7) Финальный чеклист перед merge

- [ ] enum'ы обновлены
- [ ] интерфейсы request/response есть
- [ ] schema добавлена
- [ ] repository + batch методы есть
- [ ] service + batch service есть
- [ ] module + index экспорты есть
- [ ] `BXApiSchema` обновлена
- [ ] `bitrix.service.ts` подключен
- [ ] команды используют typed API, а не строковые REST методы
- [ ] eslint по измененным файлам зеленый
