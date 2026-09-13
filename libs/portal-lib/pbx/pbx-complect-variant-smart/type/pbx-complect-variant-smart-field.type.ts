import {
    ConstSmartInstallCategory,
    ConstSmartInstallField,
    ConstSmartInstallStage,
} from '../../const-smart-registry/type/const-smart-descriptor.type';
import {
    COMPLECT_VARIANT_SMART_FIELDS,
    COMPLECT_VARIANT_SMART_GROUP,
    COMPLECT_VARIANT_SMART_STAGES,
    COMPLECT_VARIANT_SMART_TITLE,
    COMPLECT_VARIANT_SMART_TYPE,
    complectVariantStageBitrixId,
} from './pbx-complect-variant-smart.type';

/** appType полей смарта в установочном контракте. */
export const COMPLECT_VARIANT_APP_TYPE = 'complect_variant';

/** Const-конфиг → Field[] установочного контракта (адаптер вместо Excel). */
export function buildComplectVariantInstallFields(): ConstSmartInstallField[] {
    return COMPLECT_VARIANT_SMART_FIELDS.map((def, index) => ({
        name: def.name,
        appType: COMPLECT_VARIANT_APP_TYPE,
        type: def.type,
        code: def.code,
        // «Сырое» имя: префикс UF_CRM_{typeId}_ добавит установщик по ctx.
        bxFieldName: def.code,
        order: (index + 1) * 10,
        isNeedUpdate: true,
        isMultiple: def.isMultiple ?? false,
        list: [],
    }));
}

/** Код единственной воронки вариантов (ключ идемпотентности категории). */
export const COMPLECT_VARIANT_CATEGORY_CODE = 'cvar_main';

/** Цвета стадий: черновик — нейтральный, текущий — зелёный, отклонён — серый. */
const COMPLECT_VARIANT_STAGE_COLORS: Record<string, string> = {
    cvar_draft: '#3bc8f5',
    cvar_current: '#0ec96f',
    cvar_merged: '#f5a623',
    cvar_rejected: '#7d8087',
};

/** Const-конфиг → Category[] установочного контракта: одна воронка со стадиями. */
export function buildComplectVariantInstallCategories(): ConstSmartInstallCategory[] {
    return [
        {
            id: COMPLECT_VARIANT_CATEGORY_CODE,
            // entityTypeId в эталоне пуст — появляется после установки типа.
            entityTypeId: '',
            entityType: 'smart',
            type: COMPLECT_VARIANT_SMART_TYPE,
            group: COMPLECT_VARIANT_SMART_GROUP,
            name: COMPLECT_VARIANT_SMART_TITLE,
            title: COMPLECT_VARIANT_SMART_TITLE,
            bitrixId: '',
            bitrixCamelId: '',
            code: COMPLECT_VARIANT_CATEGORY_CODE,
            isActive: true,
            isNeedUpdate: true,
            order: 10,
            isDefault: true,
            stages: COMPLECT_VARIANT_SMART_STAGES.map(
                (stage, index): ConstSmartInstallStage => ({
                    id: stage.code,
                    entityTypeId: '',
                    entityType: 'smart',
                    parentType: COMPLECT_VARIANT_SMART_TYPE,
                    type: 'smart',
                    group: COMPLECT_VARIANT_SMART_GROUP,
                    name: stage.name,
                    title: stage.name,
                    bitrixId: complectVariantStageBitrixId(stage.code),
                    isActive: true,
                    smartBitrixId: '',
                    color:
                        COMPLECT_VARIANT_STAGE_COLORS[stage.code] ?? '#3bc8f5',
                    code: stage.code,
                    isNeedUpdate: true,
                    order: stage.sort,
                    bitrixEnitiyId: '',
                    isDefault: index === 0 ? 'Y' : 'N',
                    semantics: stage.semantics ?? '',
                }),
            ),
        },
    ];
}
