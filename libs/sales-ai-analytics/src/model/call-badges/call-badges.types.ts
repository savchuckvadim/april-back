/**
 * Типы и пороги справочника бейджей списка разобранных звонков.
 * Сам справочник — в call-badges.catalog (реэкспортирует этот файл).
 */

export const CALL_BADGE_TONES = ['bad', 'warn', 'neutral', 'good'] as const;
export type CallBadgeTone = (typeof CALL_BADGE_TONES)[number];

/** Семейства, внутри которых выбранные бейджи сочетаются по «или» (значения взаимоисключающие). */
export const CALL_BADGE_FAMILIES = ['outcome'] as const;
export type CallBadgeFamily = (typeof CALL_BADGE_FAMILIES)[number];

export interface CallBadgeDef {
    id: string;
    /** Короткая подпись плашки (до 28 знаков). */
    title: string;
    /** Одно предложение: что именно означает бейдж (подсказка). */
    hint: string;
    tone: CallBadgeTone;
    family: CallBadgeFamily | null;
    /** Виден в строке фильтров сразу. */
    main: boolean;
    /** Показывается в строке звонка как проблема. */
    problem: boolean;
    /** С какой даты (YYYY-MM-DD) разборы несут признак; null — всегда. Только для подсказки. */
    since: string | null;
}

/** Продвижение сделки по звонку не выше — бейдж «сделка не продвинулась» (шкала 1–5). */
export const CALL_BADGE_PROGRESS_LOW_MAX = 2;
/** Оценка раздела не выше — бейдж «слабо: раздел» (шкала 1–10; подсказка в справочнике повторяет число). */
export const CALL_BADGE_WEAK_SECTION_MAX_SCORE = 5;
