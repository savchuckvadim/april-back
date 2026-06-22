# Модули pbx-install / konstructor

Модули установки/синхронизации справочников **konstructor** на конкретном портале.
Всё работает по `domain` Bitrix-портала (резолв через `PortalStoreService.getPortalByDomain`).

Архитектура (луковая):
- **Доменный слой** — `libs/portal-lib/konstructor` (entity/repository/service, без HTTP-DTO и без Bitrix).
- **Оркестрация по `domain`** — здесь, в `apps/pbx-install/.../konstructor` (use-cases, monitoring, контроллеры, DTO).
- **PortalDB** — через konstructor-репозитории; **Bitrix** — через `PBXService` (`PBXModule`).

Главный принцип данных: **`pbx = PortalDB + Bitrix`** (что реально в Bitrix клиента).
Один и тот же «pbx»-тип используется и для отрисовки текущего состояния, и для формы.

---

## 1. `portal-measure/` — единицы измерения портала

Модуль: `PbxPortalMeasureModule` (`@Controller('pbx-portal-measure')`, `@Controller('pbx-portal-measure-monitoring')`).

| Функция | Файл | Что делает |
|---|---|---|
| Синхронизация | `use-cases/sync-portal-measures.use-case.ts` | копирует глобальные `measures` → `portal_measure` портала (идемпотентно) |
| Список | тот же use-case (`listByDomain`) | `portal_measure` портала |
| Monitoring | `services/pbx-portal-measure-monitoring.service.ts` | мердж PortalDB ↔ Bitrix (`crm.measure.list`) + глобальный справочник |

Эндпоинты:
- `GET /pbx-portal-measure/sync/domain/:domain` → `{ created, updated, total }`
- `GET /pbx-portal-measure/domain/:domain` → `PortalMeasureResponseDto[]`
- `GET /pbx-portal-measure-monitoring/domain/:domain` → `PbxMeasureMonitoringResponseDto`
  (`mergedMeasures[] {key, portal|null, bitrix|null}`, `portalMeasuresWithoutMerged`,
  `bitrixMeasuresWithoutMerged`, `globalMeasures`)

## 2. `measure/` и `contract/` — глобальные справочники (read-only)

Модули: `PbxMeasureModule` (`@Controller('pbx-measure')`),
`PbxContractModule` (`@Controller('pbx-contract')`).

Глобальные мастер-данные (общие для всех порталов). Из pbx-install — **только чтение**
(тонкая обёртка над lib-сервисами `MeasureService`/`ContractService`); редактирование — в admin.

Эндпоинты:
- `GET /pbx-measure`, `GET /pbx-measure/:id` → `MeasureResponseDto`
- `GET /pbx-contract`, `GET /pbx-contract/:id` → `ContractResponseDto`

Почему мало методов (по 2 GET): это справочники, pbx-install их только читает (для форм
и синхронизации), запись — единая точка в admin; вся логика в одном lib-сервисе.

## 3. `portal-contract/` — договоры портала

Модуль: `PbxPortalContractModule` (`@Controller('pbx-portal-contract')`).

| Функция | Файл | Что делает |
|---|---|---|
| Initial-данные формы | `use-cases/get-portal-contract-form.use-case.ts` (`getFormByDomain`) | select-опции: порталы, договоры, портальные measure, items поля `contract_type` |
| Список | тот же use-case (`listByDomain`) | `portal_contracts` портала |

Эндпоинты:
- `GET /pbx-portal-contract/form/domain/:domain` → `PortalContractFormResponseDto`
- `GET /pbx-portal-contract/domain/:domain` → `PortalContractResponseDto[]`

Создание/редактирование/удаление `portal_contract` — через admin CRUD
(`/admin/pbx/portal-contracts`), детали см. в [FRONTEND_TASK.md](FRONTEND_TASK.md).

---

## Что можно реализовать на фронте

Все запросы — по `domain` портала.

### Экран «Единицы измерения портала»
1. **Таблица текущего состояния** (источник — monitoring).
   По строке на единицу: колонки **PortalDB** (`portal`) и **Bitrix** (`bitrix`).
   Статус строки по наличию сторон:
   - есть обе → «синхронизировано»;
   - только `portal` (`portalMeasuresWithoutMerged`) → «нет в Bitrix» (не привязан `bitrixId`);
   - только `bitrix` (`bitrixMeasuresWithoutMerged`) → «есть в Bitrix, нет в PortalDB».
2. **Кнопка «Синхронизировать»** → `GET /sync/...`; после ответа `{created,updated,total}`
   показать тост и перезапросить monitoring.
3. **Добавить единицу на портал** — из `globalMeasures` (выпадающий список того, что ещё
   не заведено) → `POST /admin/pbx/portal-measures` с `portal_id`, `measure_id`.
4. **Привязка к Bitrix** — выбрать строку Bitrix и проставить `bitrixId` у `portal_measure`
   (`PUT /admin/pbx/portal-measures/:id`), чтобы строки «склеились».
5. **Редактирование/удаление** портальной единицы — admin CRUD.

### Экран «Договоры портала»
1. **Список договоров** портала → `GET /pbx-portal-contract/domain/:domain`.
2. **Форма создания договора**: подгрузить `…/form/domain/:domain` и отрисовать 4 relation-селекта
   (`portal_id`, `contract_id`, `portal_measure_id`, `bitrixfield_item_id` = тип договора
   `contract_type`) + поля `title/template/order/productName/description`.
   Сабмит → `POST /admin/pbx/portal-contracts`.
3. **Связь «договор → единица измерения»**: значение `portal_measure_id` показывает, какую
   единицу использует договор; перед созданием договоров логично прогнать sync единиц измерения.
4. **Редактирование/удаление** — admin CRUD.

### Глобальные справочники
- **Чтение из pbx-install** (для форм/выбора): `GET /pbx-measure[/:id]`, `GET /pbx-contract[/:id]`.
  Используются как источник опций select-ов/автокомплита: единица измерения и вид договора.
- **CRUD — только в admin**: `measures` (`/admin/garant/measures`) и `contracts`
  (`/admin/contracts`). Это мастер-данные, из которых наполняются портальные сущности;
  единая точка редактирования.

### Рекомендуемый сценарий
1. Заполнить глобальные `measures`/`contracts`.
2. На портале нажать «Синхронизировать единицы измерения».
3. Проверить monitoring, при необходимости привязать `bitrixId` к строкам Bitrix.
4. Создавать договоры портала через форму (select-ы из `form`-эндпоинта).

Полная спецификация запросов/ответов и тел — в [FRONTEND_TASK.md](FRONTEND_TASK.md).
