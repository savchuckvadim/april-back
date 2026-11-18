import { CALL_REPORT_SMART_FIELDS } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';

/**
 * Блоки чек-листов «5К» и «Хвост» для читаемого текста разбора: ключ пункта
 * (как в fiveKItems / hvostSteps) и подпись. Подписи НЕ свои — берутся из
 * каталога полей смарта «AI-анализ звонков» (зеркало анкеты менеджера):
 * «5К AI: клиент» → «Клиент», «Хвост AI: реакция на цену» → «Реакция на цену».
 * Порядок — порядок анкеты.
 */

/** Блок чек-листа: ключ пункта и подпись для человека. */
export interface ChecklistTextBlock {
    readonly key: string;
    readonly label: string;
}

/** Подпись поля смарта без префикса «5К AI: » / «Хвост AI: », с заглавной. */
function smartFieldLabel(code: string, fallback: string): string {
    const name = CALL_REPORT_SMART_FIELDS.find(
        field => field.code === code,
    )?.name;
    const tail = name?.split(': ').slice(1).join(': ').trim();
    if (!tail) return fallback;
    return tail.charAt(0).toUpperCase() + tail.slice(1);
}

const block = (key: string, smartCode: string): ChecklistTextBlock => ({
    key,
    label: smartFieldLabel(smartCode, key),
});

/** «5К» — пять блоков анкеты (fiveKItems). */
export const FIVE_K_TEXT_BLOCKS: readonly ChecklistTextBlock[] = [
    block('client', 'FIVE_K_CLIENT'),
    block('company', 'FIVE_K_COMPANY'),
    block('colleagues', 'FIVE_K_COLLEAGUES'),
    block('competitor', 'FIVE_K_COMPETITOR'),
    block('criteria', 'FIVE_K_CRITERIA'),
];

/** «Хвост» — пять блоков анкеты (hvostSteps). */
export const HVOST_TEXT_BLOCKS: readonly ChecklistTextBlock[] = [
    block('desire', 'HVOST_DESIRE'),
    block('offered', 'HVOST_OFFERED'),
    block('priceReaction', 'HVOST_PRICE_REACTION'),
    block('decisionProcess', 'HVOST_DECISION_PROCESS'),
    block('decisionWay', 'HVOST_DECISION_WAY'),
];
