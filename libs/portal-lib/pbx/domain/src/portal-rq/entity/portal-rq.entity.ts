/**
 * Бизнес-код пресета реквизита (совпадает с `bx_rqs.code`).
 * Именно по нему `apps/rq` ищет пресет через `PortalModel.getPresetForName`.
 */
export enum ERqPresetCode {
    ORG = 'preset_org',
    IP = 'preset_ip',
    FIZ = 'preset_fiz',
}

/**
 * Доменная модель пресета реквизита (строка таблицы `bx_rqs`).
 * Источник истины — Bitrix (`crm.requisite.preset.*`); здесь зеркало для портала.
 * Совместима по полям с `IPresetRQ`, который читает `apps/rq` через PortalModel.
 */
export class PortalRqEntity {
    id!: number;
    portalId!: number;
    name!: string | null;
    code!: string | null;
    type!: string | null;
    /** ID пресета в Bitrix (в БД хранится строкой). */
    bitrixId!: number | null;
    xmlId!: string | null;
    entityTypeId!: number | null;
    countryId!: string | null;
    isActive!: boolean;
    sort!: number | null;
}
