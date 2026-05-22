/** Fields sheet row after slice(1) and unwrapping formula cells */
export type FieldImportSheetRow = readonly [
    string, //Название поля
    string, //appType
    string, //short type - не используется
    string, //type
    string, //Значения Списка - не используется
    string, //code
    string, //lead
    string, //company
    string, //contact
    string, //deal
    string, //smart
    number, //order
    string, //isNeedUpdate 'true' | 'false'
    string, //isMultiple 'true' | 'false'
];

/** Fields sheet row after slice(1) and unwrapping formula cells */
export type SmartFieldImportSheetRow = readonly [
    string, //Название поля
    string, //appType
    string, //short type - не используется
    string, //type
    string, //Значения Списка - не используется
    string, //code
    string, //smart
    number, //order
    string, //isMultiple 'true' | 'false'
];

/** Field items sheet row after slice(1) and unwrapping formula cells */
export type FieldItemImportSheetRow = readonly [
    string, //field_name
    string, //field_code
    string, //item_name
    string, //item_code
    string, //app
    string, //item_order 10, 20, 30, 40, 50
    string, //del Y | N
    string, //isActive 'true' | 'false'
    string, //isNeedUpdate 'true' | 'false'
];
