/**
 * Подписи статусов «Движения сделок» для людей — ЕДИНСТВЕННОЕ место, где
 * они записаны (решение владельца 20.11.2026): лента сделки, сводка
 * руководителям, ночной итог в Telegram, снимок, описания DTO и настроек
 * берут подписи отсюда. Коды статусов (`stuck`, `abandoned` и т. д.) не
 * меняются никогда — сменить подпись = поправить строку в этом файле.
 *
 * Коды — те же, что `DEAL_MOVEMENT_STATUSES` в `@lib/sales-ai-analytics`
 * (там же проверка, что подпись есть у каждого статуса); здесь они ключи,
 * потому что описания настроек (portal-lib) тоже называют статусы.
 */
export const DEAL_MOVEMENT_STATUS_LABELS = {
    /** Стадия вернулась назад за окно. */
    rolled_back: 'Вернулась назад',
    /** Дольше срока в стадии, и работы по сделке за окно нет. */
    abandoned: 'Без внимания',
    /** Дольше срока в стадии, работа есть, а стадия стоит. */
    stuck: 'Без продвижения',
    /** Просроченная договорённость, серия плохих звонков и т. п. */
    at_risk: 'Под риском',
    /** Всё остальное. */
    moving: 'Движется',
} as const;

export type DealMovementStatusLabelCode =
    keyof typeof DEAL_MOVEMENT_STATUS_LABELS;

/** Подпись внутри фразы: «стали «без внимания»». */
export const dealMovementStatusWord = (
    code: DealMovementStatusLabelCode,
): string => DEAL_MOVEMENT_STATUS_LABELS[code].toLowerCase();

/** Подпись в кавычках-«ёлочках» для фраз описаний. */
export const dealMovementStatusQuoted = (
    code: DealMovementStatusLabelCode,
): string => `«${dealMovementStatusWord(code)}»`;
