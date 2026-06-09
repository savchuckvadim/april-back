import { PresetCode } from '@/apps/rq/enums/preset-code.enum';
import { PresetId } from '@/apps/rq/enums/preset-id.enum';

/**
 * Константы для работы с пресетами реквизитов
 */
export interface PresetConfig {
    org: number;
    ip: number;
    fiz: number;
}

/**
 * Fallback-значения bitrix_id пресетов.
 * Источник истины — таблица `bx_rqs` (заполняется установкой через
 * `apps/pbx-install` → PortalRqService). Эти константы используются только
 * если пресет на портале ещё не установлен/не зеркалирован в БД.
 */
export const DEFAULT_PRESET_IDS: PresetConfig = {
    org: PresetId.ORG,
    ip: PresetId.IP,
    fiz: PresetId.FIZ,
};

export const PRESET_CODE_MAP: Record<PresetCode, keyof PresetConfig> = {
    [PresetCode.ORG]: 'org',
    [PresetCode.IP]: 'ip',
    [PresetCode.FIZ]: 'fiz',
};
