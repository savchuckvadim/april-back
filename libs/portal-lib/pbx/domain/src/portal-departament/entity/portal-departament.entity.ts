/**
 * Отдел портала (таблица `departaments`).
 * В отличие от групп звонков в Bitrix ничего не создаётся: `bitrixId` — это id
 * уже существующего отдела (ОП/ОС) в структуре Bitrix. CRUD только по PortalDB.
 */
export enum EDepartamentGroup {
    sales = 'sales',
    service = 'service',
}

/** Фиксированный `type` строки `departaments`. */
export const DEPARTAMENT_TYPE = 'department' as const;
export type DepartamentType = typeof DEPARTAMENT_TYPE;

/** Доменная модель отдела (строка таблицы `departaments`). */
export class PortalDepartamentEntity {
    id!: number;
    portalId!: number;
    type!: DepartamentType;
    group!: EDepartamentGroup;
    name!: string;
    title!: string;
    bitrixId!: number;
}
