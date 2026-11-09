/**
 * Общая оценка разбора: lite-строка и ais хранят 0–100, витрина везде
 * говорит о шкале 1–10 с одной цифрой после запятой (09.11.2026: в
 * повестке показывалось «оценка 30» при «4 из 10» в причине). Нет оценки
 * (null, undefined, не число) — null.
 */
export const toScore10 = (score: number | null | undefined): number | null =>
    typeof score === 'number' && Number.isFinite(score)
        ? Math.round(score) / 10
        : null;
