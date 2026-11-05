/**
 * Id пресетов реквизитов портала по типам клиента. Источник — `bx_rqs`
 * (установка через pbx-install) или пресеты самого Bitrix; см. RqPresetService.
 * Хардкода по умолчанию нет: на каждом портале id свои.
 */
export interface PresetConfig {
    org: number;
    ip: number;
    fiz: number;
}
