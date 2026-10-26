import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

/**
 * Fail-стадия воронки (`{prefix}_fail`) полным STAGE_ID `C{cat}:{stage}`;
 * воронки или стадии нет на портале — null (вызывающий не закрывает
 * сделку и пишет предупреждение).
 */
export function dealFailStageId(
    portal: PortalModel,
    categoryCode: PbxDealCategoryCodeEnum,
): string | null {
    const category = portal.getDealCategoryByCode(categoryCode);
    if (!category) return null;
    const stage = category.stages.find(st => st.code.endsWith('_fail'));
    return stage ? `C${category.bitrixId}:${stage.bitrixId}` : null;
}
