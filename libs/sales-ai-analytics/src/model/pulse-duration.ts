import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/** Порог «разбираемого» звонка по типу звонка, секунды. */
export type MinDurationSecByType = Readonly<Record<string, number>>;

/**
 * Ключ «все прочие типы» карты порогов: звонок без типа и типы, которых в
 * карте нет. Под него сценарий кладёт значение реестра
 * `min_duration_sec_by_type`, разрешённое с контекстом портала.
 */
export const MIN_DURATION_DEFAULT_TYPE = 'default' as const;

const secondsOf = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Порог для типа звонка: значение типа → ключ «все прочие типы» →
 * константа Фазы 1a. Карты нет — прежние `shortCallSec` секунд.
 */
export function minDurationSecOf(
    callType: string | null | undefined,
    byType?: MinDurationSecByType,
): number {
    const configured = callType ? secondsOf(byType?.[callType]) : undefined;

    return (
        configured ??
        secondsOf(byType?.[MIN_DURATION_DEFAULT_TYPE]) ??
        AI_ANALYTICS_THRESHOLDS.shortCallSec
    );
}

/**
 * Эффективные пороги «разбираемого» звонка: карта определений портала и
 * значение реестра для типов вне карты (в том числе для звонка без типа).
 * Одинаковый порог у всех типов — это одно решение, и его владелец —
 * реестр (портал мог переопределить код в `ai_analytics_model_params`);
 * разные пороги по типам — это карта, и тогда тип решает сам за себя.
 *
 * Пульс и ночной конвейер обязаны строить пороги этой функцией: иначе
 * знаменатель пульса и набор разбираемых звонков конвейера разойдутся.
 */
export function minDurationByType(
    configured: MinDurationSecByType | undefined,
    registrySec?: number,
): MinDurationSecByType {
    const fallback =
        secondsOf(registrySec) ?? AI_ANALYTICS_THRESHOLDS.shortCallSec;
    const entries = Object.entries(configured ?? {}).flatMap(([type, sec]) => {
        const seconds = secondsOf(sec);

        return seconds === undefined ? [] : [[type, seconds] as const];
    });
    const uniform = new Set(entries.map(([, sec]) => sec)).size <= 1;

    return {
        ...(uniform ? {} : Object.fromEntries(entries)),
        [MIN_DURATION_DEFAULT_TYPE]: fallback,
    };
}
