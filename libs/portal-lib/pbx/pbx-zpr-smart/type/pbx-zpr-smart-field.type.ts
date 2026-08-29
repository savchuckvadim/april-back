import {
    ConstSmartInstallCategory,
    ConstSmartInstallField,
    ConstSmartInstallListItem,
    ConstSmartInstallStage,
} from '../../const-smart-registry/type/const-smart-descriptor.type';
import {
    ZPR_SMART_FIELDS,
    ZprSmartFieldDef,
    ZPR_SMART_GROUP,
    ZPR_SMART_STAGES,
    ZPR_SMART_TITLE,
    ZPR_SMART_TYPE,
    zprStageBitrixId,
} from './pbx-zpr-smart.type';

/**
 * Install-ready представление полей смарта «Звонки По решению» в формате
 * `Field` установочного контракта pbx-install (const-ветка ParseSmartService).
 */
export const ZPR_APP_TYPE = 'zpr';

/**
 * Const-конфиг → Field[] установочного контракта (адаптер вместо Excel).
 *
 * Расширение до `ZprSmartFieldDef` намеренно (зеркало презентаций): сам
 * массив объявлен `as const` ради литеральных кодов, и без расширения
 * опциональные items/isMultiple/crmEntities пришлось бы доставать через
 * `in`-нарроуинг.
 */
export function buildZprInstallFields(): ConstSmartInstallField[] {
    const defs: readonly ZprSmartFieldDef[] = ZPR_SMART_FIELDS;
    return defs.map((def, index) => ({
        name: def.name,
        appType: ZPR_APP_TYPE,
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
                DEL: 'N',
            }),
        ),
    }));
}

// ---------------------------------------------------------------------------
// Воронка со стадиями (единственная, коды по конвенции pbx `zpr_*`)
// ---------------------------------------------------------------------------

/** Код единственной воронки ЗПР (ключ идемпотентности категории). */
export const ZPR_CATEGORY_CODE = 'zpr_main';

/** Цвета стадий (палитра Bitrix): план/ожидание — процесс, исходы — итог. */
const ZPR_STAGE_COLORS: Record<string, string> = {
    zpr_plan: '#2FC6F6',
    zpr_pending: '#FFA900',
    zpr_success: '#7BD500',
    zpr_noresult: '#FF5752',
    zpr_fail: '#468EE5',
};

/**
 * Const-конфиг → Category[] установочного контракта: одна воронка со
 * стадиями из ZPR_SMART_STAGES. Семантика S/F передаётся ЯВНО (поле
 * semantics) — эвристика стратегии по суффиксу не знает NORESULT.
 */
export function buildZprInstallCategories(): ConstSmartInstallCategory[] {
    return [
        {
            id: ZPR_CATEGORY_CODE,
            // entityTypeId в эталоне пуст — появляется после установки типа.
            entityTypeId: '',
            entityType: 'smart',
            type: ZPR_SMART_TYPE,
            group: ZPR_SMART_GROUP,
            name: ZPR_SMART_TITLE,
            title: ZPR_SMART_TITLE,
            bitrixId: '',
            bitrixCamelId: '',
            code: ZPR_CATEGORY_CODE,
            isActive: true,
            isNeedUpdate: true,
            order: 10,
            isDefault: true,
            stages: ZPR_SMART_STAGES.map(
                (stage, index): ConstSmartInstallStage => ({
                    id: stage.code,
                    entityTypeId: '',
                    entityType: 'smart',
                    parentType: ZPR_SMART_TYPE,
                    type: 'smart',
                    group: ZPR_SMART_GROUP,
                    name: stage.name,
                    title: stage.name,
                    // Суффикс STATUS_ID: DT{entityTypeId}_{catId}:PLAN и т.д.
                    bitrixId: zprStageBitrixId(stage.code),
                    isActive: true,
                    smartBitrixId: '',
                    color: ZPR_STAGE_COLORS[stage.code] ?? '#2FC6F6',
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
