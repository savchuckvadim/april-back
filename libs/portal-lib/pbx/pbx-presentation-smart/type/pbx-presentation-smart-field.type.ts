import {
    ConstSmartInstallCategory,
    ConstSmartInstallField,
    ConstSmartInstallListItem,
    ConstSmartInstallStage,
} from '../../const-smart-registry/type/const-smart-descriptor.type';
import {
    PRESENTATION_SMART_FIELDS,
    PRESENTATION_SMART_GROUP,
    PRESENTATION_SMART_STAGES,
    PRESENTATION_SMART_TITLE,
    PRESENTATION_SMART_TYPE,
    PresentationSmartFieldDef,
    presentationStageBitrixId,
} from './pbx-presentation-smart.type';

/**
 * Install-ready представление полей смарта «Презентации» в формате `Field`
 * установочного контракта pbx-install (const-ветка ParseSmartService).
 */
export const PRESENTATION_APP_TYPE = 'pres';

/**
 * Const-конфиг → Field[] установочного контракта (адаптер вместо Excel).
 *
 * Расширение до `PresentationSmartFieldDef` намеренно: сам массив объявлен
 * `as const` ради литеральных кодов, и без расширения опциональные items/
 * isMultiple/crmEntities пришлось бы доставать через `in`-нарроуинг.
 */
export function buildPresentationInstallFields(): ConstSmartInstallField[] {
    const defs: readonly PresentationSmartFieldDef[] =
        PRESENTATION_SMART_FIELDS;
    return defs.map((def, index) => ({
        name: def.name,
        appType: PRESENTATION_APP_TYPE,
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
// Воронка со стадиями (единственная, коды по конвенции pbx `pres_*`)
// ---------------------------------------------------------------------------

/** Код единственной воронки презентаций (ключ идемпотентности категории). */
export const PRESENTATION_CATEGORY_CODE = 'pres_main';

/**
 * Цвета стадий — палитра воронки сделок «ОП Презентации»
 * (PbxDealSalesPresentationCategoryType): зеркало обязано узнаваться
 * визуально, иначе менеджер не поймёт, что смотрит на ту же презентацию.
 *
 * У стадий контура согласования аналога в воронке сделок нет, поэтому цвета
 * подобраны по смыслу: ожидание решения — охра, возврат на доработку —
 * серый (заявку вернули люди, это не провал клиента, и красный рядом с
 * «Отказом после презентации» путал бы их).
 */
const PRESENTATION_STAGE_COLORS: Record<string, string> = {
    pres_new: '#3bc8f5',
    pres_approve: '#f5a623',
    pres_plan: '#0ec96f',
    pres_pending: '#ef3000',
    pres_success: '#00ff00',
    pres_rejected: '#7d8087',
    pres_noresult: '#2d0b0d',
    pres_fail: '#e7354a',
};

/**
 * Const-конфиг → Category[] установочного контракта: одна воронка со
 * стадиями из PRESENTATION_SMART_STAGES. Семантика S/F передаётся ЯВНО
 * (поле semantics) — эвристика стратегии по суффиксу не знает NORESULT.
 */
export function buildPresentationInstallCategories(): ConstSmartInstallCategory[] {
    return [
        {
            id: PRESENTATION_CATEGORY_CODE,
            // entityTypeId в эталоне пуст — появляется после установки типа.
            entityTypeId: '',
            entityType: 'smart',
            type: PRESENTATION_SMART_TYPE,
            group: PRESENTATION_SMART_GROUP,
            name: PRESENTATION_SMART_TITLE,
            title: PRESENTATION_SMART_TITLE,
            bitrixId: '',
            bitrixCamelId: '',
            code: PRESENTATION_CATEGORY_CODE,
            isActive: true,
            isNeedUpdate: true,
            order: 10,
            isDefault: true,
            stages: PRESENTATION_SMART_STAGES.map(
                (stage, index): ConstSmartInstallStage => ({
                    id: stage.code,
                    entityTypeId: '',
                    entityType: 'smart',
                    parentType: PRESENTATION_SMART_TYPE,
                    type: 'smart',
                    group: PRESENTATION_SMART_GROUP,
                    name: stage.name,
                    title: stage.name,
                    // Суффикс STATUS_ID: DT{entityTypeId}_{catId}:PLAN и т.д.
                    bitrixId: presentationStageBitrixId(stage.code),
                    isActive: true,
                    smartBitrixId: '',
                    color: PRESENTATION_STAGE_COLORS[stage.code] ?? '#3bc8f5',
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
