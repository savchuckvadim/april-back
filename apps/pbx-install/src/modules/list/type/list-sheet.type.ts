/** Лист `lists` после slice(1) и разворачивания формульных ячеек */
export type ListImportSheetRow = readonly [
    string | number, // id
    string, // type
    string, // group
    string, // name
    string, // code
    string | number, // order
];

/** Лист `fields` после slice(1) и разворачивания формульных ячеек */
export type ListFieldImportSheetRow = readonly [
    string, // Название поля
    string, // appType
    string, // type (string | datetime | enumeration | employee | crm | multiple ...)
    string, // field_code (op_work_status)
    string, // field_btx_code (OP_WORK_STATUS)
    string | number, // order
    string | boolean, // isNeedUpdate
    string | boolean, // isActive
];

/** Лист `fieldsItems` после slice(1) и разворачивания формульных ячеек */
export type ListFieldItemImportSheetRow = readonly [
    string, // item_name
    string, // field_code (op_work_status)
    string, // item_code (op_status_in_work)
    string, // code (OP_STATUS_IN_WORK)
    string | number, // order
    string, // del Y | N
    string | boolean, // isActive
    string | boolean, // isNeedUpdate
];
