/**
 * Цифры проверки точности прогноза словами для сводки запуска (вынесено
 * из launch-status.forecast-blocks ради размера). Чистые функции.
 */
import type { Phase4BacktestView } from '../services/ai-analytics-phase4.types';

const pct = (share: number): number => Math.round(share * 100);

/** «ошибка середины на 37 % меньше, чем у «…»» по MASE против эталона. */
function versusText(value: number | null, label: string): string | null {
    if (value === null || !Number.isFinite(value)) return null;
    const diff = Math.round(Math.abs(1 - value) * 100);
    if (diff === 0) return `ошибка середины такая же, как у «${label}»`;
    return value < 1
        ? `ошибка середины на ${diff} % меньше, чем у «${label}»`
        : `ошибка середины на ${diff} % больше, чем у «${label}»`;
}

/**
 * Цифры проверки словами (решение владельца 05.11.2026: в админке видно
 * то же, что в базе): попадание факта в вилку и выигрыш середины у
 * простых способов.
 */
export function backtestNumbersText(view: Phase4BacktestView): string {
    const parts: string[] = [];
    if (view.coverageShare !== null) {
        const target =
            view.coverageTarget === null
                ? ''
                : ` (нужно ${pct(view.coverageTarget)} %)`;
        parts.push(
            `факт попал в вилку в ${pct(view.coverageShare)} % дней${target}`,
        );
    }
    for (const text of [
        versusText(view.maseNaive, 'по темпу с начала месяца'),
        versusText(view.maseMean3, 'среднего за три месяца'),
    ]) {
        if (text) parts.push(text);
    }
    return parts.join(', ');
}

/** Что дальше при провале: узкая вилка при хорошей середине — не «рано вообще». */
export function failAdvice(view: Phase4BacktestView): string {
    const onlyBand =
        view.reasons.includes('coverage-below') &&
        !view.reasons.includes('mase-naive');
    return onlyBand
        ? 'Середина прогноза уже не хуже простых способов, мешает узкая вилка: вилка калибруется по истории — нажмите «Восстановить прогноз по истории», проверка пересчитается.'
        : 'Показывать прогноз пока рано: середина не точнее простых способов.';
}
