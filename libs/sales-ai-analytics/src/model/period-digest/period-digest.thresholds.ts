import { DIGEST_UNIT, DigestUnit } from './period-digest.codes';
import type { DigestPeriodKind } from './period-digest.types';

/**
 * Параметры карточки периода по умолчанию (решения владельца 01.11 и
 * ведущего 17.11.2026). Это значения по умолчанию аргументов функций, а
 * не параметры реестра: портал переопределяет их своими настройками
 * `period_digest_*` в event-sales.
 */

/** Порог сдвига метрики по единице: 0,5 балла, 10 п. п. доли, 0,5 на звонок. */
export interface DigestShift {
    readonly score: number;
    readonly share: number;
    readonly perCall: number;
}

export const DIGEST_DEFAULT_SHIFT: DigestShift = {
    score: 0.5,
    share: 0.1,
    perCall: 0.5,
};

/** Порог сдвига для единицы метрики. */
export function digestShiftOf(
    unit: DigestUnit,
    shift: DigestShift = DIGEST_DEFAULT_SHIFT,
): number {
    switch (unit) {
        case DIGEST_UNIT.score:
            return shift.score;
        case DIGEST_UNIT.share:
            return shift.share;
        default:
            return shift.perCall;
    }
}

/** Изменение счётчика (звонков, дней) замечается с единицы. */
export const DIGEST_COUNT_SHIFT = 1;

/** Минимум наблюдений под метрикой-якорем: 3 за неделю, 5 за месяц. */
export const DIGEST_ANCHOR_MIN_N: Readonly<Record<DigestPeriodKind, number>> = {
    week: 3,
    month: 5,
};

/** Минимум разобранных звонков на карточку с рекомендациями (настройка портала). */
export const DIGEST_MIN_CALLS = 5;

/** Сравнение с отделом — только когда менеджеров с данными не меньше. */
export const DIGEST_MIN_PEERS = 3;

/** Активных рекомендаций у менеджера не больше. */
export const DIGEST_MAX_ACTIVE = 3;

/** Оценок рекомендации после выдачи — не больше (дальше закрепить или обсудить). */
export const DIGEST_MAX_EVALUATIONS = 3;
