# Konstructor (measure/contract) — детальные задачи

Бэклог по справочникам/портальным сущностям konstructor. Контекст и текущая реализация —
в [README.md](README.md) и [FRONTEND_TASK.md](FRONTEND_TASK.md).

Принципы: правила проекта (`CLAUDE.md`, `ai/rules/*`), без `any`, описания на русском в
контроллерах/DTO, тесты в `__tests__` на уровне модуля, доступ к Bitrix — typed API
(`@lib/bitrix`, гайд `libs/bitrix/src/BITRIX_DOMAIN_MODULE_GUIDE.md`).

---

## ✅ Сделано
- Домен measure/contract/portal-measure/portal-contract в `libs/portal-lib/konstructor`.
- admin (`apps/admin`) переведён на konstructor (тонкие контроллеры).
- pbx-install: `portal-measure` (sync/list/monitoring PortalDB↔Bitrix), `portal-contract`
  (form/list), read-only справочники `pbx-measure`/`pbx-contract`.
- **@lib/bitrix: typed-домен `crm.measure`** (`bitrix.measure.{getList,get,add,update,delete}` +
  batch); monitoring использует `bitrix.measure.getList()`.

---

## 1. Синхронизация поля сделки `contract_type` (тип договора) — приоритет
**Зачем:** `portal_contract.bitrixfield_item_id` ссылается на item enum-поля сделки
`contract_type`. Нужно гарантировать, что поле существует в Bitrix-сделке клиента с
корректными enum-items, синхронизировать его с PortalDB (`bitrixfields` + `bitrixfield_items`),
и держать в согласии с `portal_contracts`.

**Объём:**
- Use-case в pbx-install: проверить/создать пользовательское поле сделки `contract_type`
  (enum) в Bitrix (через `@lib/bitrix` userfield), залить/обновить его items (виды договоров),
  upsert в PortalDB (`bitrixfields`/`bitrixfield_items`). Переиспользовать существующие
  field-install сервисы (`apps/pbx-install/.../deal/.../fields`, `shared/entity`).
- Monitoring `contract_type`: portalDB items ↔ Bitrix enum-items (по образцу
  `pbx-portal-measure-monitoring`), эндпоинт `GET /pbx-portal-contract-monitoring/domain/:domain`.
- Связать с `portal_contracts`: показать, какие items уже используются договорами.

**Фронт (учесть):** `C:\Projects\April\front\konstructor\src\modules\types\contract-type.ts`,
`.../redux/reducers/pbx-deal/pbx-deal-reducer.ts` — сейчас `CONTRACT = 'contract_type'`
закомментировано; поле — ENUM/SELECT deal-field с items = виды договоров. После бэка
раскомментировать и завести `contract_type` в инициализацию сделки.

## 2. Создание `portal_contract` из pbx-install — отдельная задача
**Зачем:** сейчас создание только через admin CRUD. Возможно нужен эндпоинт по `domain`
в pbx-install (по словам — «может временно вынести»).
**Объём:** use-case `CreatePortalContractUseCase` (резолв портала по domain, валидация
relation-id: `contract_id`, `portal_measure_id`, `bitrixfield_item_id`), контроллер
`POST /pbx-portal-contract/domain/:domain`. DTO + тесты. По возможности переиспользовать
`PortalContractService.create` из konstructor.

## 3. Полный переезд admin в единственный экземпляр
**Зачем:** избавиться от легаси-зеркала и старого фронт-клиента, начать пользоваться `apps/admin`.
**Объём:**
- Оставить единственным `apps/admin`; зеркало `apps/back/src/apps/admin` — удалить (после
  переезда; см. общий план чистки `apps/back`).
- Проверить развёртывание `apps/admin` (docker-compose dev/prod, env, порты, CI) по
  скилу `monorepo-add-app`/существующим аппам; пофиксить ошибки запуска.
- Фронт: настроить новый API-клиент на `apps/admin` (новые роуты `/admin/...`,
  `/pbx-measure`, `/pbx-contract` и т.д.), мигрировать с легаси-клиента (другая ветка,
  без монорепы, аналог `apps/back`).

## 4. Monitoring/доводка
- Bitrix-метод единиц измерения: подтвердить на реальном портале (`crm.measure.list`);
  при необходимости — `catalog.measure.list` (тогда добавить typed-домен в `@lib/bitrix`).
- Полный прогон сборки всех приложений и всего jest; ручная проверка через Swagger.

---

> Крупные пункты (1–3) можно вести как отдельные задачи/PR. Перед merge каждого — lint
> (`pnpm run lint`), тесты, сборка затронутых приложений.
