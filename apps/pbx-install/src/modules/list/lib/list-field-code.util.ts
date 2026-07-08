/** Ключ списка для построения кодов полей */
export interface ListFieldCodeKey {
    type: string;
    group: string;
}

/**
 * Полный CODE свойства списка в Bitrix и `bitrixfields.code` в PortalDB —
 * легаси-конвенция Laravel-инсталлера: `${group}_${type}_${code}`
 * (например `sales_kpi_crm_company`). Именно по нему легаси-потребители
 * ищут поле: `portal.model.getIdByCodeFieldList` матчит
 * `field.code === ${list.group}_${list.type}_${code}`.
 */
export function fullListFieldCode(
    list: ListFieldCodeKey,
    fieldCode: string,
): string {
    return `${list.group}_${list.type}_${fieldCode}`.toLowerCase();
}

/**
 * Кандидаты CODE для поиска существующего свойства в Bitrix (UPPERCASE
 * для case-insensitive сравнения): полный легаси-код, btx-код из шаблона
 * (EVENT_DATE — так ошибочно писала ранняя версия установщика),
 * короткий код шаблона.
 */
export function listFieldCodeCandidates(
    list: ListFieldCodeKey,
    field: { code: string; bxFieldName: string },
): string[] {
    return [
        fullListFieldCode(list, field.code),
        field.bxFieldName,
        field.code,
    ].map(c => c.toUpperCase());
}
