import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

/** Итог резолва воронок, в которых разрешён поиск/показ сделок-дублей. */
export interface DuplicateDealCategoryFilter {
    /** bitrixId (CATEGORY_ID) разрешённых воронок. Пусто — сделки исключаются. */
    allowedBitrixIds: number[];
    warnings: string[];
}

/**
 * Только НАШИ воронки: ОП Основная (sales_base), опционально ТМЦ (tmc_base).
 * Презентации (sales_presentation) и ХО (sales_xo) исключены намеренно —
 * это аналитические сделки, дублей контрагентов там нет (решение ТЗ).
 *
 * ПРАВИЛО БЕЗОПАСНОСТИ: если категория на портале не сконфигурирована —
 * возвращаем ПУСТОЙ список (сделки полностью выпадают из поиска), а не
 * «все воронки». Молчаливое расширение на чужие воронки — прямой путь к
 * тому, что руководитель смержит чужую сделку.
 */
export function resolveDuplicateDealCategories(
    portalModel: Pick<PortalModel, 'getDealCategoryByCode'>,
    options?: { includeTmc?: boolean },
): DuplicateDealCategoryFilter {
    const allowedBitrixIds: number[] = [];
    const warnings: string[] = [];

    const wanted: PbxDealCategoryCodeEnum[] = [
        PbxDealCategoryCodeEnum.sales_base,
    ];
    if (options?.includeTmc) {
        wanted.push(PbxDealCategoryCodeEnum.tmc_base);
    }

    for (const code of wanted) {
        const category = portalModel.getDealCategoryByCode(code);
        const bitrixId = Number(category?.bitrixId);
        if (category && Number.isFinite(bitrixId)) {
            allowedBitrixIds.push(bitrixId);
        } else {
            warnings.push(
                `Воронка «${code}» не сконфигурирована на портале — сделки этой воронки исключены из поиска дублей`,
            );
        }
    }

    return { allowedBitrixIds, warnings };
}
