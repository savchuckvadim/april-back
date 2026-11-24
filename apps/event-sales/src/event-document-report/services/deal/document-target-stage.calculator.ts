import { SalesDocumentKind } from '@lib/queue';
import {
    getSalesBaseStageOrder,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { EVENT_DOCUMENT_KIND_RULES } from '../../types/event-document.kind-rules';

/** Самая дальняя стадия среди документов события; null — документов нет. */
export const documentTargetStageCode = (
    kinds: readonly SalesDocumentKind[],
): PbxDealSalesBaseStageCode | null =>
    kinds
        .map(kind => EVENT_DOCUMENT_KIND_RULES[kind].baseStage)
        .reduce<PbxDealSalesBaseStageCode | null>(
            (farthest, stage) =>
                farthest &&
                getSalesBaseStageOrder(farthest) >=
                    getSalesBaseStageOrder(stage)
                    ? farthest
                    : stage,
            null,
        );

/**
 * Куда документ двигает «ОП Основная»; null — сделка остаётся на месте.
 *
 * Только вперёд по полной лестнице стадий: сделку на «Документы отправлены»
 * и дальше КП назад не откатывает, закрытая (успех, отказ, дубль) стоит
 * выше всех рабочих стадий и не двигается вовсе. Неизвестная текущая стадия
 * (своя стадия портала вне лестницы) — не трогаем: сравнивать не с чем.
 */
export const resolveDocumentStageMove = (
    currentStage: PbxDealSalesBaseStageCode | null,
    kinds: readonly SalesDocumentKind[],
): PbxDealSalesBaseStageCode | null => {
    const target = documentTargetStageCode(kinds);
    if (!target || !currentStage) return null;
    return getSalesBaseStageOrder(target) > getSalesBaseStageOrder(currentStage)
        ? target
        : null;
};
