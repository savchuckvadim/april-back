# Задание для фронта: единицы измерения и виды договоров портала

Новая админка управления **единицами измерения** (`measure` / `portal_measure`) и
**видами договоров** (`contract` / `portal_contract`) для конкретного портала.

Есть два уровня данных:

- **Глобальные справочники** (общие для всех порталов): `measures`, `contracts`.
- **Портальные** (привязаны к порталу): `portal_measure`, `portal_contracts`.

Портал в pbx-install определяется по `domain`, в admin — по числовому `portalId`.

---

## 1. Сценарий работы

1. Заполнить/проверить глобальные справочники `measures` и `contracts` (admin CRUD).
2. **Синхронизировать единицы измерения портала**: `GET /pbx-portal-measure/sync/domain/:domain`
   — создаёт строки `portal_measure` из глобальных `measures` (идемпотентно).
3. Открыть форму создания договора портала: `GET /pbx-portal-contract/form/domain/:domain`
   — отдаёт все select-опции (порталы, договоры, портальные единицы измерения, типы договора).
4. Создать `portal_contract` (admin CRUD `POST /admin/pbx/portal-contracts`), указав связи.

Связь «какую единицу измерения использует договор» — это поле `portal_measure_id`
у `portal_contract` (ссылка на `portal_measure`).

---

## 2. Эндпоинты pbx-install (по `domain`)

### Синхронизация единиц измерения
`GET /pbx-portal-measure/sync/domain/:domain`

Ответ:
```json
{ "created": 3, "updated": 5, "total": 8 }
```
- `created` — создано новых `portal_measure`;
- `updated` — обновлено существующих;
- `total` — всего у портала после синхронизации.

### Список единиц измерения портала
`GET /pbx-portal-measure/domain/:domain` → `PortalMeasureResponseDto[]`
```json
[{ "id": 1, "measure_id": 1, "portal_id": 7, "bitrixId": "5",
   "name": "Штука", "shortName": "шт", "fullName": "Штука" }]
```

### Initial-данные формы создания договора
`GET /pbx-portal-contract/form/domain/:domain`
```json
{
  "portals":        [{ "id": 7, "name": "a.bx24.ru", "title": "a.bx24.ru" }],
  "contracts":      [{ "id": 1, "name": "Поставка", "title": "Поставка" }],
  "portalMeasures": [{ "id": 3, "name": "Штука", "title": "Штука" }],
  "contractTypeItems": [
    { "id": 100, "name": "Договор", "title": "Договор", "code": "dogovor", "bitrixId": 101 }
  ]
}
```
- `portals` → select `portal_id`;
- `contracts` → select `contract_id`;
- `portalMeasures` → select `portal_measure_id`;
- `contractTypeItems` → select `bitrixfield_item_id` (items pbx-поля сделки `contract_type` — «тип договора»).

### Список договоров портала
`GET /pbx-portal-contract/domain/:domain` → `PortalContractResponseDto[]`

---

## 3. Эндпоинты admin (CRUD, по числовым id)

### Глобальные единицы измерения — `measures`
- `GET /admin/garant/measures` — список
- `GET /admin/garant/measures/:id`
- `POST /admin/garant/measures` — body: `{ name, shortName, fullName, code, type? }`
- `PUT /admin/garant/measures/:id`
- `DELETE /admin/garant/measures/:id`

### Глобальные виды договоров — `contracts`
- `GET /admin/contracts`, `GET /admin/contracts/:id`
- `POST /admin/contracts` — body: `{ name, number, title, code, type, withPrepayment, template?, order?, coefficient?, prepayment?, discount?, productName?, product?, service?, description?, comment?, comment1?, comment2? }`
- `PUT /admin/contracts/:id`, `DELETE /admin/contracts/:id`

### Портальные единицы измерения — `portal_measure`
- `GET /admin/pbx/portal-measures?portalId=&measureId=` — список (фильтры опциональны)
- `GET /admin/pbx/portal-measures/:id`
- `POST /admin/pbx/portal-measures` — body: `{ portal_id, measure_id, bitrixId?, name?, shortName?, fullName? }`
- `PUT /admin/pbx/portal-measures/:id`, `DELETE /admin/pbx/portal-measures/:id`

### Портальные договоры — `portal_contracts`
- `GET /admin/pbx/portal-contracts?portalId=&contractId=`
- `GET /admin/pbx/portal-contracts/:id`
- `POST /admin/pbx/portal-contracts`, `PUT /admin/pbx/portal-contracts/:id`, `DELETE /admin/pbx/portal-contracts/:id`

---

## 4. Форма создания `portal_contract`

Поля формы:

| Поле                  | Тип            | Источник опций (из `form`)         | Обяз. |
|-----------------------|----------------|------------------------------------|-------|
| `portal_id`           | select         | `portals`                          | да    |
| `contract_id`         | select         | `contracts`                        | да    |
| `portal_measure_id`   | select         | `portalMeasures`                   | да    |
| `bitrixfield_item_id` | select         | `contractTypeItems` (contract_type)| да    |
| `title`               | string         | —                                  | да    |
| `template`            | string         | —                                  | нет   |
| `order`               | number         | —                                  | нет   |
| `productName`         | string         | —                                  | нет   |
| `description`         | string         | —                                  | нет   |

Тело `POST /admin/pbx/portal-contracts`:
```json
{
  "portal_id": 7,
  "contract_id": 1,
  "portal_measure_id": 3,
  "bitrixfield_item_id": 100,
  "title": "Договор поставки",
  "template": "https://...",
  "order": 1,
  "productName": "Товар",
  "description": "..."
}
```

Все id в ответах — числа (BigInt из БД сериализуется в number на бэке).
