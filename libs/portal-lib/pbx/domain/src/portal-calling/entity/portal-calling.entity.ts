/**
 * Группа звонков в Bitrix (`sonet_group`).
 * Поддерживает три типа разрезов: тип `calling` фиксирован.
 */
export enum ECallingGroup {
    sales = 'sales',
    service = 'service',
    tmc = 'tmc',
}

/** Фиксированный `type` строки `callings`. */
export const CALLING_TYPE = 'calling' as const;
export type CallingType = typeof CALLING_TYPE;

/** Доменная модель группы звонков (строка таблицы `callings`). */
export class PortalCallingEntity {
    id!: number;
    portalId!: number;
    type!: CallingType;
    group!: ECallingGroup;
    name!: string;
    title!: string;
    bitrixId!: number;
}
