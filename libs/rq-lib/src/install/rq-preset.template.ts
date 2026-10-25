import { ERqPresetCode } from '@lib/portal-lib/pbx-domain';
import { PresetName } from '../enums/preset-name.enum';
import { PresetId } from '../enums/preset-id.enum';
import { RqPresetTemplate } from './rq-install.types';

/** ENTITY_TYPE_ID пресета реквизита в Bitrix (CRM_REQUISITE). */
const REQUISITE_ENTITY_TYPE_ID = 8;
/** COUNTRY_ID = Россия. */
const COUNTRY_ID_RU = 1;

/**
 * Эталон пресетов реквизитов (org/ip/fiz).
 * Источник истины для Install/Monitoring; реальные bitrix_id появляются после
 * установки и зеркалируются в `bx_rqs`.
 */
export const RQ_PRESET_TEMPLATE: RqPresetTemplate[] = [
    {
        code: ERqPresetCode.ORG,
        name: PresetName.ORGANIZATION,
        type: 'org',
        xmlId: 'april_rq_preset_org',
        entityTypeId: REQUISITE_ENTITY_TYPE_ID,
        countryId: COUNTRY_ID_RU,
        defaultBitrixId: PresetId.ORG,
        sort: 100,
    },
    {
        code: ERqPresetCode.IP,
        name: PresetName.IP,
        type: 'ip',
        xmlId: 'april_rq_preset_ip',
        entityTypeId: REQUISITE_ENTITY_TYPE_ID,
        countryId: COUNTRY_ID_RU,
        defaultBitrixId: PresetId.IP,
        sort: 200,
    },
    {
        code: ERqPresetCode.FIZ,
        name: PresetName.PHYSICAL_PERSON,
        type: 'fiz',
        xmlId: 'april_rq_preset_fiz',
        entityTypeId: REQUISITE_ENTITY_TYPE_ID,
        countryId: COUNTRY_ID_RU,
        defaultBitrixId: PresetId.FIZ,
        sort: 300,
    },
];
