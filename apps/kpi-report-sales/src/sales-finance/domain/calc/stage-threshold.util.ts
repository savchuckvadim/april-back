/**
 * Резолвинг порога «горячести» в набор STAGE_ID открытых стадий портала.
 *
 * Берём коды лестницы sales_base с order от пороговой стадии (включительно)
 * до стадии «Успех» (не включая), маппим на runtime-стадии категории портала
 * и собираем полные STAGE_ID вида `C{category.bitrixId}:{stage.bitrixId}`.
 */
import { Logger } from '@nestjs/common';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    getSalesBaseStageOrder,
    PBX_DEAL_SALES_BASE_STAGES,
    PBX_DEAL_SALES_BASE_WON_ORDER,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    SALES_HOT_THRESHOLD_STAGE_CODE,
    SalesHotThreshold,
} from '../../constants/sales-finance.const';

export interface StageThresholdResolution {
    /** Полные STAGE_ID для фильтра crm.deal.list. */
    stageIds: string[];
    /** STAGE_ID → { code, name } для обогащения ответа. */
    stageByStageId: Map<string, { code: string; name: string }>;
}

const logger = new Logger('SalesFinanceStageThreshold');

export function resolveStageIdsFromThreshold(
    category: IPCategory,
    threshold: SalesHotThreshold,
): StageThresholdResolution {
    const thresholdOrder = getSalesBaseStageOrder(
        SALES_HOT_THRESHOLD_STAGE_CODE[threshold],
    );

    const stageIds: string[] = [];
    const stageByStageId = new Map<string, { code: string; name: string }>();

    const ladder = PBX_DEAL_SALES_BASE_STAGES.filter(
        item =>
            item.order >= thresholdOrder &&
            item.order < PBX_DEAL_SALES_BASE_WON_ORDER,
    );

    for (const ladderStage of ladder) {
        const portalStage = category.stages.find(
            stage => stage.code === ladderStage.code,
        );
        if (!portalStage) {
            logger.warn(
                `Стадия ${ladderStage.code} не настроена на портале — пропускаю`,
            );
            continue;
        }
        const stageId = `C${category.bitrixId}:${portalStage.bitrixId}`;
        stageIds.push(stageId);
        stageByStageId.set(stageId, {
            code: portalStage.code,
            name: portalStage.name,
        });
    }

    return { stageIds, stageByStageId };
}
