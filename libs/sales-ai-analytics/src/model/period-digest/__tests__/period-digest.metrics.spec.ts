import {
    datedLiteRow,
    liteSection,
} from '../../../__tests__/dated-lite-row.fixture';
import type { DatedLiteRow } from '../../dated-lite-row';
import { minDurationMapOf } from '../../manager-type-matrix';
import { DEFAULT_WORK_CALENDAR } from '../../workdays.util';
import { DIGEST_READINESS } from '../period-digest.codes';
import {
    buildDigestMetrics,
    digestMethodologyOf,
    digestQualityRows,
    digestReadinessOf,
} from '../period-digest.metrics';

/** Неделя 2026-W46: пн 09.11 — вс 15.11, пять рабочих дней. */
const WEEK = { from: '2026-11-09', to: '2026-11-15' };
const CURRENT_PROMPT = { prompt: 'focus-v3.1-2026-11-06' };
/** Версия вне таблицы серий — своя серия с датой из строки. */
const OTHER_SERIES_PROMPT = { prompt: 'focus-v9-2026-12-01' };

const row = (
    id: string,
    callType: string,
    at: string,
    patch: Partial<DatedLiteRow> = {},
): DatedLiteRow =>
    datedLiteRow({
        transcriptionId: id,
        callType,
        callStartedAt: new Date(at),
        ...patch,
    });

const metricsOf = (rows: readonly DatedLiteRow[], minN = 2) =>
    buildDigestMetrics({
        rows,
        period: WEEK,
        calendar: DEFAULT_WORK_CALENDAR,
        minDurationByType: minDurationMapOf(60),
        minN,
        lowScoreCallMax: 4,
    });

const WEEK_ROWS: DatedLiteRow[] = [
    row('a', 'presentation', '2026-11-09T08:00:00Z', {
        score: 70,
        sections: [liteSection('NEEDS', 4), liteSection('PRESENTATION', 6)],
        nextStep: { set: true, date: '2026-11-12' },
        versions: CURRENT_PROMPT,
    }),
    row('b', 'presentation', '2026-11-10T08:00:00Z', {
        score: 50,
        sections: [liteSection('PRESENTATION', 8), liteSection('NEEDS', 6)],
        nextStep: { set: true, date: null },
        versions: OTHER_SERIES_PROMPT,
    }),
    row('c', 'refine', '2026-11-10T09:00:00Z', {
        score: 30,
        sections: [liteSection('NEEDS', 2)],
        nextStep: null,
        objections: [
            { category: 'price', quote: null, handled: false, outcome: null },
        ],
        versions: CURRENT_PROMPT,
    }),
    // Короткий: записан (день не «молчит»), но вне слоя качества.
    row('d', 'cold', '2026-11-12T08:00:00Z', { durationSec: 10 }),
    // Без разбора и в субботу: записан, но не разобран и не рабочий день.
    row('e', 'call', '2026-11-14T08:00:00Z', {
        analysisPresent: false,
        score: null,
    }),
];

describe('метрики менеджера за период', () => {
    it('объём, дисциплина, «молчание»', () => {
        const metrics = metricsOf(WEEK_ROWS);

        expect(metrics.recorded).toBe(5);
        expect(metrics.analyzed).toBe(3);
        expect(metrics.byType).toEqual([
            { callType: 'presentation', n: 2 },
            { callType: 'refine', n: 1 },
        ]);
        expect(metrics.nextStepSet).toEqual({ value: 2 / 3, n: 3 });
        expect(metrics.nextStepDated).toEqual({ value: 1 / 3, n: 3 });
        expect(metrics.workdays).toBe(5);
        // Среда 11.11 и пятница 13.11 — без записанных звонков.
        expect(metrics.silentWorkdays).toBe(2);
    });

    it('качество: средняя, разделы в порядке рубрики, худший и лучший', () => {
        const metrics = metricsOf(WEEK_ROWS);

        expect(metrics.score).toEqual({ value: 5, n: 3 });
        expect(metrics.sections).toEqual([
            { section: 'NEEDS', mean: 4, n: 3, standing: null },
            { section: 'PRESENTATION', mean: 7, n: 2, standing: null },
        ]);
        expect(metrics.worstSection).toBe('NEEDS');
        expect(metrics.bestSection).toBe('PRESENTATION');
    });

    it('раздел с объёмом меньше минимума не бывает худшим или лучшим', () => {
        const metrics = metricsOf(WEEK_ROWS, 3);

        expect(metrics.worstSection).toBe('NEEDS');
        expect(metrics.bestSection).toBeNull();
    });

    it('доработка и слабые звонки', () => {
        const metrics = metricsOf(WEEK_ROWS);

        expect(metrics.objectionUnhandled).toEqual({ value: 1, n: 1 });
        expect(metrics.followupStepNoDate).toEqual({ value: null, n: 0 });
        expect(metrics.lowScoreShare).toEqual({ value: 1 / 3, n: 3 });
        expect(metrics.methodology).toBeNull();
    });

    it('серия версий: самая поздняя, смешение замечено', () => {
        expect(metricsOf(WEEK_ROWS)).toMatchObject({
            seriesStart: '2026-12-01',
            seriesMixed: true,
        });
        expect(
            metricsOf(WEEK_ROWS.filter(item => item.transcriptionId !== 'b')),
        ).toMatchObject({ seriesStart: '2026-06-25', seriesMixed: false });
        expect(metricsOf([])).toMatchObject({
            recorded: 0,
            analyzed: 0,
            silentWorkdays: 5,
            score: { value: null, n: 0 },
            sections: [],
            worstSection: null,
            seriesStart: null,
            seriesMixed: false,
        });
    });

    it('слой качества: разбор есть и звонок не короче порога своего типа', () => {
        const rows = [
            row('p', 'presentation', '2026-11-09T08:00:00Z', {
                durationSec: 200,
            }),
            row('c', 'cold', '2026-11-09T09:00:00Z', { durationSec: 200 }),
            row('n', 'cold', '2026-11-09T10:00:00Z', {
                analysisPresent: false,
            }),
        ];

        expect(
            digestQualityRows(
                rows,
                minDurationMapOf(60, { presentation: 300 }),
            ).map(item => item.transcriptionId),
        ).toEqual(['c']);
    });
});

describe('методика периода', () => {
    const methodology = (patch: {
        code?: string | null;
        checkpointsDone?: number | null;
        checkpointsTotal?: number | null;
        spiralsFull?: number | null;
        spiralsMinFull?: number | null;
        dealProgress?: number | null;
    }) => ({
        code: 'polyansky',
        checkpointsDone: null,
        checkpointsTotal: null,
        spiralsFull: null,
        spiralsMinFull: null,
        dealProgress: null,
        capsApplied: 0,
        ...patch,
    });

    it('чек-пункты по типам, спирали, норма по самому свежему разбору', () => {
        const rows = [
            row('p1', 'presentation', '2026-11-09T08:00:00Z', {
                methodology: methodology({
                    checkpointsDone: 3,
                    checkpointsTotal: 4,
                    spiralsFull: 2,
                    spiralsMinFull: 2,
                    dealProgress: 4,
                }),
            }),
            row('p2', 'presentation', '2026-11-11T08:00:00Z', {
                methodology: methodology({
                    checkpointsDone: 1,
                    checkpointsTotal: 4,
                    spiralsFull: 1,
                    spiralsMinFull: 3,
                    dealProgress: 2,
                }),
            }),
            row('c1', 'cold', '2026-11-10T08:00:00Z', {
                methodology: methodology({
                    checkpointsDone: 2,
                    checkpointsTotal: 2,
                    dealProgress: 3,
                }),
            }),
            row('r1', 'refine', '2026-11-12T08:00:00Z'),
        ];

        expect(digestMethodologyOf(rows)).toEqual({
            checkpoints: [
                { callType: 'cold', done: 2, total: 2 },
                { callType: 'presentation', done: 4, total: 8 },
            ],
            spiralsFullMean: { value: 1.5, n: 2 },
            spiralsMinFull: 3,
            fullSpiralCalls: 1,
            dealProgressMean: { value: 3, n: 3 },
        });
    });

    it('разборов с методикой нет — методика выключена', () => {
        const rows = [
            row('p1', 'presentation', '2026-11-09T08:00:00Z', {
                methodology: methodology({ code: null, dealProgress: 3 }),
            }),
            row('p2', 'presentation', '2026-11-09T09:00:00Z'),
        ];

        expect(digestMethodologyOf(rows)).toBeNull();
    });
});

describe('готовность данных карточки', () => {
    it('нет звонков, мало данных, достаточно', () => {
        expect(digestReadinessOf({ recorded: 0, analyzed: 0 }, 5)).toBe(
            DIGEST_READINESS.noCalls,
        );
        expect(digestReadinessOf({ recorded: 9, analyzed: 4 }, 5)).toBe(
            DIGEST_READINESS.fewData,
        );
        expect(digestReadinessOf({ recorded: 9, analyzed: 5 }, 5)).toBe(
            DIGEST_READINESS.ok,
        );
    });
});
