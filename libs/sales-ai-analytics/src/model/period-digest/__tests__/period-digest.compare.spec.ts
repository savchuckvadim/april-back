import { DIGEST_MOVEMENT } from '../period-digest.codes';
import {
    compareDigestMetrics,
    digestDeltaOf,
    digestVersionsDiffer,
    yearAgoCompare,
} from '../period-digest.compare';
import type { DigestMetrics } from '../period-digest.types';

const metrics = (patch: Partial<DigestMetrics> = {}): DigestMetrics => ({
    recorded: 20,
    analyzed: 12,
    byType: [],
    nextStepSet: { value: 0.8, n: 12 },
    nextStepDated: { value: 0.5, n: 12 },
    workdays: 5,
    silentWorkdays: 1,
    score: { value: 6, n: 12 },
    sections: [],
    worstSection: null,
    bestSection: null,
    objectionUnhandled: { value: null, n: 0 },
    followupStepNoDate: { value: null, n: 0 },
    lowScoreShare: { value: 0.2, n: 12 },
    methodology: null,
    seriesStart: '2026-06-25',
    seriesMixed: false,
    ...patch,
});

const section = (code: string, mean: number, n = 6) => ({
    section: code,
    mean,
    n,
    standing: null,
});

const OPTIONS = { minN: 5 };

describe('изменение метрики к другому периоду', () => {
    it('вверх / вниз — с порога, ниже порога — без изменений', () => {
        expect(
            digestDeltaOf({ value: 5, n: 6 }, { value: 5.5, n: 6 }, 0.5, 5),
        ).toEqual({
            before: { value: 5, n: 6 },
            after: { value: 5.5, n: 6 },
            delta: 0.5,
            movement: DIGEST_MOVEMENT.up,
        });
        expect(
            digestDeltaOf({ value: 0.5, n: 6 }, { value: 0.4, n: 6 }, 0.1, 5)
                .movement,
        ).toBe(DIGEST_MOVEMENT.down);
        expect(
            digestDeltaOf({ value: 5, n: 6 }, { value: 5.4, n: 6 }, 0.5, 5)
                .movement,
        ).toBe(DIGEST_MOVEMENT.flat);
    });

    it('мало данных с любой стороны — сравнивать нечего', () => {
        expect(
            digestDeltaOf({ value: 5, n: 4 }, { value: 9, n: 6 }, 0.5, 5),
        ).toMatchObject({ delta: null, movement: DIGEST_MOVEMENT.noData });
        expect(
            digestDeltaOf({ value: 5, n: 6 }, { value: null, n: 0 }, 0.5, 5),
        ).toMatchObject({ delta: null, movement: DIGEST_MOVEMENT.noData });
    });
});

describe('сравнение карточки с прошлым периодом', () => {
    it('счётчики — с единицы, оценки и доли — с порога сдвига', () => {
        const compare = compareDigestMetrics(
            metrics({
                analyzed: 15,
                silentWorkdays: 1,
                score: { value: 6.2, n: 15 },
                nextStepDated: { value: 0.7, n: 15 },
            }),
            metrics({ analyzed: 12, silentWorkdays: 2 }),
            '2026-W45',
            OPTIONS,
        );

        expect(compare.periodKey).toBe('2026-W45');
        expect(compare.analyzed).toMatchObject({
            delta: 3,
            movement: DIGEST_MOVEMENT.up,
        });
        expect(compare.silentWorkdays).toMatchObject({
            delta: -1,
            movement: DIGEST_MOVEMENT.down,
        });
        expect(compare.score.movement).toBe(DIGEST_MOVEMENT.flat);
        expect(compare.nextStepDated.movement).toBe(DIGEST_MOVEMENT.up);
        expect(compare.versionsDiffer).toBe(false);
    });

    it('порог сдвига — параметр: настройка портала меняет вывод', () => {
        const compare = compareDigestMetrics(
            metrics({ score: { value: 6.2, n: 15 } }),
            metrics(),
            '2026-W45',
            { minN: 5, shift: { score: 0.2, share: 0.1, perCall: 0.5 } },
        );

        expect(compare.score.movement).toBe(DIGEST_MOVEMENT.up);
    });

    it('разделы — только те, что есть в обоих периодах', () => {
        const compare = compareDigestMetrics(
            metrics({
                sections: [section('NEEDS', 4), section('CLOSING', 7)],
            }),
            metrics({
                sections: [section('NEEDS', 5), section('PRICE', 3)],
            }),
            '2026-10',
            OPTIONS,
        );

        expect(compare.sections).toEqual([
            {
                section: 'NEEDS',
                before: { value: 5, n: 6 },
                after: { value: 4, n: 6 },
                delta: -1,
                movement: DIGEST_MOVEMENT.down,
            },
        ]);
    });

    it('другая серия версий разбора — сравнение есть, с пометкой', () => {
        const current = metrics({ seriesStart: '2026-12-01' });
        const compare = compareDigestMetrics(
            current,
            metrics(),
            '2026-10',
            OPTIONS,
        );

        expect(compare.versionsDiffer).toBe(true);
        expect(compare.analyzed.movement).toBe(DIGEST_MOVEMENT.flat);
        expect(digestVersionsDiffer(current, { seriesStart: null })).toBe(
            false,
        );
    });
});

describe('тот же период год назад', () => {
    it('нет данных за год назад — сравнения нет', () => {
        expect(yearAgoCompare(metrics(), null, null, OPTIONS)).toBeNull();
        expect(
            yearAgoCompare(
                metrics(),
                metrics({ recorded: 3, analyzed: 0 }),
                '2025-11',
                OPTIONS,
            ),
        ).toBeNull();
    });

    it('данные есть — обычное сравнение с ключом прошлого года', () => {
        expect(
            yearAgoCompare(
                metrics({ analyzed: 12 }),
                metrics({ analyzed: 8 }),
                '2025-11',
                OPTIONS,
            ),
        ).toMatchObject({
            periodKey: '2025-11',
            analyzed: { delta: 4, movement: DIGEST_MOVEMENT.up },
        });
    });
});
