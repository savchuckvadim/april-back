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

/**
 * Известные тэги для сборки «размазанного» отдела (`multiple_tag`).
 * Значение не ограничено этим списком — допускается произвольный custom-тэг.
 */
export const DEPARTAMENT_MULTIPLE_TAGS = ['ОП', 'ОС'] as const;

/** Доменная модель отдела (строка таблицы `departaments`). */
export class PortalDepartamentEntity {
    id!: number;
    portalId!: number;
    type!: DepartamentType;
    group!: EDepartamentGroup;
    name!: string;
    title!: string;
    bitrixId!: number;
    /** Собирать ли ЦУП из разрозненных по всей структуре отделов. */
    isMultiple!: boolean;
    /** По какому тэгу искать эти отделы: ОП / ОС или custom. */
    multipleTag!: string | null;
}
