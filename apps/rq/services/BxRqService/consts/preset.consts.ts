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
