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
    /*
     * «Доработка» стоит МЕЖДУ презентацией и документами: после презентации
     * клиента дорабатывают (узнают компанию, ИНН, реквизиты) и только потом
     * готовят документы. До 22.08.2026 стадия стояла после «Отправлены»
     * (order 7) — это было неверно, порядок исправлен вместе с воронкой.
     */
    { code: 'sales_refine', order: 5 },
    { code: 'sales_offer_create', order: 6 },
    { code: 'sales_document_send', order: 7 },
    { code: 'sales_in_progress', order: 8 },
    { code: 'sales_money_await', order: 9 },
    { code: 'sales_supply', order: 10 },
    { code: 'sales_success', order: 11 },
    { code: 'sales_fail', order: 12 },
    { code: 'sales_double', order: 13 },
    { code: 'sales_not_ca', order: 14 },
] as const satisfies readonly { code: string; order: number }[];

export type PbxDealSalesBaseStageCode =
    (typeof PBX_DEAL_SALES_BASE_STAGES)[number]['code'];

/** Общий префикс кодов стадий воронки sales_base. */
export const PBX_DEAL_SALES_BASE_STAGE_PREFIX = 'sales_' as const;

/**
 * Суффикс кода стадии sales_base (`sales_refine` → `refine`).
 *
 * Выводится из самой лестницы, поэтому склейка `sales_${suffix}` не может
 * дать код несуществующей стадии — компилятор поймает это на месте.
 */
export type PbxDealSalesBaseStageSuffix =
    PbxDealSalesBaseStageCode extends `${typeof PBX_DEAL_SALES_BASE_STAGE_PREFIX}${infer Suffix}`
        ? Suffix
        : never;

/**
 * Именованные коды стадий — вместо строковых литералов в бизнес-коде
 * (ai/rules/pbx-typing.md: никаких magic strings для стадий).
 */
export const PBX_DEAL_SALES_BASE_STAGE_CODE = {
    new: 'sales_new',
    cold: 'sales_cold',
    warm: 'sales_warm',
    presentation: 'sales_pres',
    refine: 'sales_refine',
    offerCreate: 'sales_offer_create',
    documentSend: 'sales_document_send',
    inProgress: 'sales_in_progress',
    moneyAwait: 'sales_money_await',
    supply: 'sales_supply',
    success: 'sales_success',
    fail: 'sales_fail',
    /** «Не состоялась» (APOLOGY) — отказ без результата разговора. */
    apology: 'sales_double',
    /** «Не ЦА» (NOT_CA) — клиент не целевой, отдельный финал отказа. */
    notCa: 'sales_not_ca',
} as const satisfies Record<string, PbxDealSalesBaseStageCode>;

/**
 * Порядок стадии «Успех» (WON) — открытые сделки всегда ниже него.
 * ⚠ Обязан совпадать с order sales_success выше: kpi-report-sales по нему
 * отсекает «горячие» стадии, и рассинхрон выкинул бы supply из горячих.
 */
export const PBX_DEAL_SALES_BASE_WON_ORDER = 11;

/** Порядок стадии по её коду; undefined для неизвестного кода. */
export function getSalesBaseStageOrder(
    code: PbxDealSalesBaseStageCode,
): number {
    const stage = PBX_DEAL_SALES_BASE_STAGES.find(item => item.code === code);
    return stage ? stage.order : 0;
}
