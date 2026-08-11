import {
    ConstSmartInstallField,
    ConstSmartInstallListItem,
} from '../../const-smart-registry/type/const-smart-descriptor.type';
import { SKAP_SMART_FIELDS } from './pbx-skap-smart.type';

/**
 * Install-ready представление полей смарта «СКАП» в формате `Field`
 * установочного контракта pbx-install (const-ветка ParseSmartService).
 */
export const SKAP_APP_TYPE = 'skap';

/** Const-конфиг → Field[] установочного контракта (адаптер вместо Excel). */
export function buildSkapInstallFields(): ConstSmartInstallField[] {
    return SKAP_SMART_FIELDS.map((def, index) => ({
        name: def.name,
        appType: SKAP_APP_TYPE,
        type: def.type,
        code: def.code,
        // «Сырое» имя: префикс UF_CRM_{typeId}_ добавит установщик по ctx.
        bxFieldName: def.code,
        order: (index + 1) * 10,
        isNeedUpdate: true,
        isMultiple: def.isMultiple ?? false,
        crmEntities: def.crmEntities,
        list: (def.items ?? []).map(
            (item): ConstSmartInstallListItem => ({
                VALUE: item.VALUE,
                CODE: item.CODE,
                XML_ID: item.CODE,
                SORT: item.SORT,
                DEL: '',
            }),
        ),
    }));
}
