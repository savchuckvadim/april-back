import { PresetCode } from '@/apps/rq/enums/preset-code.enum';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PresetConfig, DEFAULT_PRESET_IDS } from '../consts/preset.consts';

/**
 * Утилиты для работы с пресетами
 */

/**
 * Получает конфигурацию пресетов из PortalModel
 */
export const getPresetConfig = (portalModel: PortalModel): PresetConfig => {
    const presetOrg = portalModel.getPresetForName(PresetCode.ORG);
    const presetIp = portalModel.getPresetForName(PresetCode.IP);
    const presetFiz = portalModel.getPresetForName(PresetCode.FIZ);

    return {
        org: presetOrg?.bitrix_id || DEFAULT_PRESET_IDS.org,
        ip: presetIp?.bitrix_id || DEFAULT_PRESET_IDS.ip,
        fiz: presetFiz?.bitrix_id || DEFAULT_PRESET_IDS.fiz,
    };
};
