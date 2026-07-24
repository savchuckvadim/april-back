/**
 * Runtime-лестница стадий воронки «ОП Основная» (sales_base).
 *
 * Значения дословно перенесены из типа PbxDealSalesBaseCategoryType
 * (../type/pbx-deal-sales-base.type.ts): runtime IStage портала не содержит
 * order, поэтому порядок стадий («от стадии X и выше») берётся отсюда.
 *
 * Устаревший PortalDealSalesBaseStageCodeEnum использовать нельзя —
 * его коды не совпадают с реальной лестницей.
 */

export const PBX_DEAL_SALES_BASE_STAGES = [
    { code: 'sales_new', order: 1 },
    { code: 'sales_cold', order: 2 },
    { code: 'sales_warm', order: 3 },
    { code: 'sales_pres', order: 4 },
    { code: 'sales_offer_create', order: 5 },
    { code: 'sales_document_send', order: 6 },
    { code: 'sales_in_progress', order: 7 },
    { code: 'sales_money_await', order: 8 },
    { code: 'sales_supply', order: 9 },
    { code: 'sales_success', order: 10 },
    { code: 'sales_fail', order: 11 },
    { code: 'sales_double', order: 12 },
] as const satisfies readonly { code: string; order: number }[];

export type PbxDealSalesBaseStageCode =
    (typeof PBX_DEAL_SALES_BASE_STAGES)[number]['code'];

/** Порядок стадии «Успех» (WON) — открытые сделки всегда ниже него. */
export const PBX_DEAL_SALES_BASE_WON_ORDER = 10;

/** Порядок стадии по её коду; undefined для неизвестного кода. */
export function getSalesBaseStageOrder(
    code: PbxDealSalesBaseStageCode,
): number {
    const stage = PBX_DEAL_SALES_BASE_STAGES.find(item => item.code === code);
    return stage ? stage.order : 0;
}
