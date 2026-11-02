import type { AnalyticsLiteSection } from '@lib/call-lib';
import {
    assembleQualityFacts,
    emptyQualityFacts,
    sectionMeansOf,
} from '../domain/assembler/call-quality-facts.assembler';
import { assembleCallFacts } from '../domain/assembler/call-facts.assembler';
import { defaultAttentionThresholds } from '../domain/loaders/attention-thresholds.util';
import {
    hasCallDate,
    type DatedLiteRow,
} from '../domain/loaders/lite-row.mapper';
import { liteRow } from './fixtures/lite-row.fixture';

/**
 * Факты качества этапа 2 (решение владельца 19.10.2026): средние разделов
 * презентаций и доработки, доли «не отработано» и «без даты», звонки с
 * низкой оценкой — по lite-строкам слоя качества, в шкале 1–10.
 */
const section = (
    code: string,
    score: number | null,
    relevance = 1,
): AnalyticsLiteSection => ({
    section: code,
    relevance,
    score,
    asWas: null,
    alternatives: [],
});

const row = (
    id: string,
    callType: string | null,
    patch: Partial<DatedLiteRow> = {},
): DatedLiteRow =>
    [liteRow({ transcriptionId: id, managerId: '10', callType, ...patch })]
        .filter(hasCallDate)
        .map(item => item)[0];

const THRESHOLDS = defaultAttentionThresholds();

describe('assembleQualityFacts', () => {
    it('презентации: средние NEEDS / PRESENTATION по оценённым разделам, слабые звонки по порогу', () => {
        const facts = assembleQualityFacts(
            [
                row('p1', 'presentation', {
                    sections: [section('NEEDS', 4), section('PRESENTATION', 8)],
                }),
                row('p2', 'presentation', {
                    sections: [
                        section('NEEDS', 7),
                        // Раздел не применим — в среднюю не идёт.
                        section('PRESENTATION', 2, 0),
                    ],
                }),
                row('p3', 'presentation', {
                    sections: [section('NEEDS', null), section('GREETING', 3)],
                }),
                // Холодный звонок к презентациям не относится.
                row('c1', 'cold', { sections: [section('NEEDS', 1)] }),
            ],
            THRESHOLDS,
        );
        expect(facts.presentation).toEqual({
            n: 3,
            sections: [
                { section: 'NEEDS', mean: 5.5, n: 2 },
                { section: 'PRESENTATION', mean: 8, n: 1 },
            ],
            weakCallIds: ['p1'],
        });
        expect(facts.thresholds).toEqual(THRESHOLDS);
    });

    it('доработка: возражения без отработки, шаг без даты, средние OBJECTIONS / CLOSING, слабые звонки', () => {
        const facts = assembleQualityFacts(
            [
                row('f1', 'refine', {
                    objections: [
                        {
                            category: 'price',
                            quote: 'Дорого',
                            handled: false,
                            outcome: null,
                        },
                        {
                            category: null,
                            quote: null,
                            handled: null,
                            outcome: null,
                        },
                    ],
                    nextStep: { set: true, date: null },
                    sections: [section('OBJECTIONS', 6), section('CLOSING', 7)],
                }),
                row('f2', 'decision', {
                    objections: [
                        {
                            category: 'timing',
                            quote: 'Не сейчас',
                            handled: true,
                            outcome: 'continued',
                        },
                    ],
                    nextStep: { set: true, date: '2026-09-10' },
                    sections: [section('CLOSING', 3)],
                }),
                row('f3', 'refine', {
                    nextStep: { set: false, date: null },
                    sections: [section('OBJECTIONS', 8), section('CLOSING', 8)],
                }),
            ],
            THRESHOLDS,
        );
        expect(facts.followup).toEqual({
            n: 3,
            objectionsKnown: 2,
            objectionsUnhandled: 1,
            nextStepSet: 2,
            nextStepNoDate: 1,
            sections: [
                { section: 'OBJECTIONS', mean: 7, n: 2 },
                { section: 'CLOSING', mean: 6, n: 3 },
            ],
            // f1 — возражение не отработано и шаг без даты, f2 — слабое закрытие.
            weakCallIds: ['f1', 'f2'],
        });
    });

    it('звонки с низкой оценкой: шкала 0–100 → 1–10, порог не выше, по id; типы вне корзин не считаются', () => {
        const facts = assembleQualityFacts(
            [
                row('b', 'cold', { score: 40 }),
                row('a', 'presentation', { score: 35 }),
                row('c', 'call', { score: 41 }),
                row('d', null, { score: null }),
                // Приглашение на мероприятие и «прочее» — вне средней оценки,
                // поэтому и вне сигнала о низких оценках.
                row('e', 'event_invite', { score: 20 }),
                row('f', 'other', { score: 20 }),
            ],
            THRESHOLDS,
        );
        expect(facts.lowScoreCalls).toEqual([
            { transcriptionId: 'a', callType: 'presentation', score: 3.5 },
            { transcriptionId: 'b', callType: 'cold', score: 4 },
        ]);
        expect(
            assembleQualityFacts([row('c', 'call', { score: 41 })], {
                ...THRESHOLDS,
                lowScoreCallMax: 5,
            }).lowScoreCalls,
        ).toHaveLength(1);
    });

    it('пустые факты и sectionMeansOf без оценок', () => {
        expect(emptyQualityFacts(THRESHOLDS)).toEqual({
            thresholds: THRESHOLDS,
            presentation: { n: 0, sections: [], weakCallIds: [] },
            followup: {
                n: 0,
                objectionsKnown: 0,
                objectionsUnhandled: 0,
                nextStepSet: 0,
                nextStepNoDate: 0,
                sections: [],
                weakCallIds: [],
            },
            lowScoreCalls: [],
            progress: { n: 0, calls: [] },
        });
        expect(sectionMeansOf([], ['NEEDS'])).toEqual([]);
    });

    it('assembleCallFacts кладёт факты качества по звонкам слоя качества и порогам опций', () => {
        const facts = assembleCallFacts(
            [
                row('p1', 'presentation', {
                    sections: [section('NEEDS', 4)],
                    score: 30,
                }),
                // Короткий звонок — вне слоя качества.
                row('short', 'presentation', {
                    durationSec: 10,
                    sections: [section('NEEDS', 1)],
                    score: 10,
                }),
            ],
            {
                to: '2026-09-06',
                timeZone: 'Europe/Moscow',
                thresholds: { ...THRESHOLDS, lowScoreCallMax: 2 },
            },
        );
        const quality = facts.get('10')?.quality;
        expect(quality?.presentation.n).toBe(1);
        expect(quality?.presentation.weakCallIds).toEqual(['p1']);
        expect(quality?.lowScoreCalls).toEqual([]);
        expect(quality?.thresholds.lowScoreCallMax).toBe(2);
    });
});

describe('факты методики: спирали презентаций и продвижение сделок (02.11.2026)', () => {
    const methodology = (
        spiralsFull: number | null,
        spiralsMinFull: number | null,
        dealProgress: number | null,
    ) => ({
        code: 'polyansky',
        checkpointsDone: 1,
        checkpointsTotal: 2,
        spiralsFull,
        spiralsMinFull,
        dealProgress,
        capsApplied: 0,
    });

    it('спирали: среднее полных витков, норма из самого свежего разбора, презентации ниже своей нормы', () => {
        const facts = assembleQualityFacts(
            [
                row('p1', 'presentation', {
                    callStartedAt: new Date('2026-09-01T08:00:00Z'),
                    methodology: methodology(1, 3, null),
                }),
                row('p2', 'presentation', {
                    callStartedAt: new Date('2026-09-03T08:00:00Z'),
                    methodology: methodology(2, 2, null),
                }),
                row('p3', 'presentation', {
                    callStartedAt: new Date('2026-09-02T08:00:00Z'),
                    methodology: methodology(0, 3, null),
                }),
                // Спирали не считались — в среднее не идёт.
                row('p4', 'presentation', {
                    methodology: methodology(null, null, null),
                }),
                // Холодный звонок к презентациям не относится.
                row('c1', 'cold', { methodology: methodology(0, 3, null) }),
            ],
            THRESHOLDS,
        );
        expect(facts.presentation.spirals).toEqual({
            n: 3,
            meanFull: 1,
            minFull: 2,
            belowMinCallIds: ['p1', 'p3'],
        });
    });

    it('без разборов со спиралями поля spirals у презентаций нет', () => {
        const facts = assembleQualityFacts(
            [
                row('p1', 'presentation', {
                    methodology: methodology(null, null, null),
                }),
            ],
            THRESHOLDS,
        );
        expect(facts.presentation.spirals).toBeUndefined();
    });

    it('продвижение: звонки с движением сделки и среди них — с оценкой ниже порога качества, по id', () => {
        const facts = assembleQualityFacts(
            [
                row('a3', 'presentation', {
                    score: 45,
                    methodology: methodology(null, null, 4),
                }),
                row('a1', 'refine', {
                    score: 59,
                    methodology: methodology(null, null, 5),
                }),
                row('a2', 'presentation', {
                    score: 80,
                    methodology: methodology(null, null, 5),
                }),
                // Сделка не двигалась — вне счётчика.
                row('a4', 'presentation', {
                    score: 20,
                    methodology: methodology(null, null, 2),
                }),
                // Без оценки — вне счётчика.
                row('a5', 'presentation', {
                    score: null,
                    methodology: methodology(null, null, 5),
                }),
            ],
            THRESHOLDS,
        );
        expect(facts.progress).toEqual({
            n: 3,
            calls: [
                {
                    transcriptionId: 'a1',
                    callType: 'refine',
                    score: 5.9,
                    dealProgress: 5,
                },
                {
                    transcriptionId: 'a3',
                    callType: 'presentation',
                    score: 4.5,
                    dealProgress: 4,
                },
            ],
        });
        expect(facts.thresholds.qualityScoreMin).toBe(6);
        expect(facts.thresholds.progressMovingMin).toBe(4);
        expect(emptyQualityFacts(THRESHOLDS).progress).toEqual({
            n: 0,
            calls: [],
        });
    });
});
