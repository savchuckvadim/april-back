/**
 * Ключи пунктов чек-листов «Хвост» и «5К» в ответе модели (`hvostSteps`,
 * `fiveKItems`) и в местах разговора по пунктам (`hvostEvidence`,
 * `fiveKEvidence`, задание focus-v3.4). Порядок — порядок анкеты менеджера.
 * Подписи пунктов — `HVOST_TEXT_BLOCKS` / `FIVE_K_TEXT_BLOCKS`.
 */

/** «Хвост» — пять блоков анкеты (op_xvost_*). */
export const HVOST_STEP_KEYS = [
    'desire',
    'offered',
    'priceReaction',
    'decisionProcess',
    'decisionWay',
] as const;
export type HvostStepKey = (typeof HVOST_STEP_KEYS)[number];

/** «5К» — пять блоков анкеты (op_5k_*). */
export const FIVE_K_ITEM_KEYS = [
    'client',
    'company',
    'colleagues',
    'competitor',
    'criteria',
] as const;
export type FiveKItemKey = (typeof FIVE_K_ITEM_KEYS)[number];
