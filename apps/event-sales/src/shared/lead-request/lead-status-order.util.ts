import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    findPbxLeadStage,
    PBX_LEAD_STAGES,
    PbxLeadStageCode,
    PbxLeadStageTemplateItem,
} from '@lib/portal-lib/pbx-domain/portal-lead/stages/const/pbx-lead-stages.const';

/**
 * Позиция статуса лида в воронке продаж — для правила «статус назад не
 * откатываем».
 *
 * STATUS_ID лида → стадия шаблона: сначала по сопоставлению портала
 * (`PortalModel`), затем по желаемому STATUS_ID шаблона — системные NEW /
 * IN_PROCESS и наши PBX_* порталы часто не сопоставляют вручную.
 */
const stageOfStatus = (
    portal: PortalModel,
    statusId: string,
): PbxLeadStageTemplateItem | undefined => {
    const code = portal.getLeadStageCodeByStatusId(statusId);
    const mapped = code ? findPbxLeadStage(code) : undefined;
    return (
        mapped ??
        PBX_LEAD_STAGES.sales.find(stage => stage.bitrixStatusId === statusId)
    );
};

/**
 * Статус лида стоит РАНЬШЕ целевой стадии — двигать вперёд можно.
 *
 *  - статуса нет → раньше (лид ещё никуда не поставлен);
 *  - статус не узнан (клиентский, не сопоставлен) → НЕ раньше: где он в
 *    воронке, неизвестно, и молча откатить продвинутый лид хуже, чем не
 *    сдвинуть новый;
 *  - та же стадия → не раньше: писать нечего.
 */
export const isLeadStatusBefore = (
    portal: PortalModel,
    statusId: unknown,
    target: PbxLeadStageCode,
): boolean => {
    const current =
        typeof statusId === 'string' || typeof statusId === 'number'
            ? String(statusId).trim()
            : '';
    if (!current) return true;
    const stage = stageOfStatus(portal, current);
    const targetStage = findPbxLeadStage(target);
    if (!stage || !targetStage) return false;
    return stage.order < targetStage.order;
};
