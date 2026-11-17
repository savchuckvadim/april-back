import { DIGEST_MOVEMENT, DIGEST_UNIT } from './period-digest.codes';
import {
    DIGEST_COUNT_SHIFT,
    DIGEST_DEFAULT_SHIFT,
    DigestShift,
    digestShiftOf,
} from './period-digest.thresholds';
import type {
    DigestCompare,
    DigestDelta,
    DigestMetrics,
    DigestValue,
} from './period-digest.types';

/**
 * СРАВНЕНИЕ карточки с другим периодом: прошлый период той же длины
 * (неделя → прошлая неделя, месяц → прошлый месяц) и тот же месяц год
 * назад — только если за него есть данные. Направление «вверх / вниз» —
 * по величине с порогом сдвига; лучше это или хуже, решает тот, кто
 * читает метрику. Разные серии версий разбора сравнение не отменяют:
 * ставится пометка «считалось другой версией разбора» (решение 01.11).
 */

export interface DigestCompareOptions {
    /** Минимум наблюдений, с которого значение сравнивается. */
    readonly minN: number;
    readonly shift?: DigestShift;
}

const EPSILON = 1e-9;

/** Изменение значения с порогом; мало данных с любой стороны — «нет данных». */
export function digestDeltaOf(
    before: DigestValue,
    after: DigestValue,
    threshold: number,
    minN: number,
): DigestDelta {
    if (
        before.value === null ||
        after.value === null ||
        before.n < minN ||
        after.n < minN
    ) {
        return { before, after, delta: null, movement: DIGEST_MOVEMENT.noData };
    }
    const delta = after.value - before.value;
    const movement =
        delta >= threshold - EPSILON
            ? DIGEST_MOVEMENT.up
            : delta <= -threshold + EPSILON
              ? DIGEST_MOVEMENT.down
              : DIGEST_MOVEMENT.flat;
    return { before, after, delta, movement };
}

/** Счётчик как значение: объём — сам счётчик (данных всегда «достаточно»). */
const countValue = (count: number): DigestValue => ({ value: count, n: 1 });

/**
 * Серии версий разошлись: у обоих периодов серия известна и она разная.
 * Внутри одной серии минорные версии промпта сравнимы (решение 01.11).
 */
export const digestVersionsDiffer = (
    current: Pick<DigestMetrics, 'seriesStart'>,
    base: Pick<DigestMetrics, 'seriesStart'>,
): boolean =>
    current.seriesStart !== null &&
    base.seriesStart !== null &&
    current.seriesStart !== base.seriesStart;

/** Сравнение метрик периода с метриками другого периода. */
export function compareDigestMetrics(
    current: DigestMetrics,
    base: DigestMetrics,
    baseKey: string,
    options: DigestCompareOptions,
): DigestCompare {
    const shift = options.shift ?? DIGEST_DEFAULT_SHIFT;
    const scoreShift = digestShiftOf(DIGEST_UNIT.score, shift);
    const sections = current.sections.flatMap(section => {
        const before = base.sections.find(
            item => item.section === section.section,
        );
        if (!before) return [];
        return [
            {
                section: section.section,
                ...digestDeltaOf(
                    { value: before.mean, n: before.n },
                    { value: section.mean, n: section.n },
                    scoreShift,
                    options.minN,
                ),
            },
        ];
    });
    return {
        periodKey: baseKey,
        analyzed: digestDeltaOf(
            countValue(base.analyzed),
            countValue(current.analyzed),
            DIGEST_COUNT_SHIFT,
            1,
        ),
        score: digestDeltaOf(
            base.score,
            current.score,
            scoreShift,
            options.minN,
        ),
        nextStepDated: digestDeltaOf(
            base.nextStepDated,
            current.nextStepDated,
            digestShiftOf(DIGEST_UNIT.share, shift),
            options.minN,
        ),
        silentWorkdays: digestDeltaOf(
            countValue(base.silentWorkdays),
            countValue(current.silentWorkdays),
            DIGEST_COUNT_SHIFT,
            1,
        ),
        sections,
        versionsDiffer: digestVersionsDiffer(current, base),
    };
}

/**
 * Тот же период год назад — только если за него есть разобранные звонки
 * (решение владельца 01.11: «год назад» не обязателен). Нет — null.
 */
export function yearAgoCompare(
    current: DigestMetrics,
    base: DigestMetrics | null,
    baseKey: string | null,
    options: DigestCompareOptions,
): DigestCompare | null {
    if (!base || baseKey === null || base.analyzed === 0) return null;
    return compareDigestMetrics(current, base, baseKey, options);
}
