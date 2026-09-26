import {
    latestPerTranscription,
    pairsHashOf,
    promptKeyOf,
    promptVersionOf,
    RETEST_SIGMA_SCALE,
    scoreOf,
    toAgreementPair,
    toAgreementRun,
} from '../use-cases/call-report-retest.util';

/**
 * Помощники test-retest (Фаза 3, П7): разбор → прогон согласия читается
 * структурно, выборка берёт последнюю запись на звонок, ключи и хэши
 * детерминированы.
 */
const analysis = (overrides: Record<string, unknown> = {}) => ({
    callType: 'presentation',
    productive: true,
    refusalCategory: null,
    coachingPriority: 'high',
    nextStep: { set: true, date: '2026-09-30' },
    weightedScore: 72,
    sections: [
        { section: 'NEEDS', relevance: 100, score: 8 },
        { section: 'PRICE', relevance: 0, score: 3 },
        { section: 'CLOSING', relevance: 50, score: null },
    ],
    objections: [
        { category: 'price' },
        { category: 'timing' },
        { category: 'price' },
        { quote: 'без категории' },
    ],
    versions: { prompt: 'focus-v2.3-2026-09-25' },
    ...overrides,
});

describe('toAgreementRun — разбор → прогон согласия', () => {
    it('категории, шкалы (балл 1–10, разделы с relevance > 0) и коды возражений', () => {
        expect(toAgreementRun(analysis())).toEqual({
            categories: {
                callType: 'presentation',
                productive: 'yes',
                refusalCategory: null,
                coachingPriority: 'high',
                nextStepSet: 'yes',
            },
            scales: { score: 7.2, section_NEEDS: 8 },
            objections: ['price', 'timing'],
        });
        expect(RETEST_SIGMA_SCALE).toBe('score');
    });

    it('старый разбор без weightedScore берёт score 1–10; не объект — null', () => {
        expect(scoreOf({ score: 6 })).toBe(6);
        expect(scoreOf({})).toBeNull();
        expect(toAgreementRun('мусор')).toBeNull();
        expect(toAgreementRun({ callType: 3 })?.categories.callType).toBeNull();
    });
});

describe('выборка и ключи', () => {
    it('promptVersionOf читает versions.prompt; latestPerTranscription — максимальный id', () => {
        expect(promptVersionOf(analysis())).toBe('focus-v2.3-2026-09-25');
        expect(promptVersionOf({})).toBeNull();
        const latest = latestPerTranscription([
            { id: '10', transcription_id: 't-1', user_result: null },
            { id: '12', transcription_id: 't-1', user_result: null },
            { id: '11', transcription_id: null, user_result: null },
            { id: '9', transcription_id: 't-2', user_result: null },
        ]);
        expect(
            [...latest.entries()].map(([key, record]) => [key, record.id]),
        ).toEqual([
            ['t-1', '12'],
            ['t-2', '9'],
        ]);
    });

    it('ключ отчёта и хэш пар детерминированы и не зависят от порядка пар', () => {
        expect(promptKeyOf('focus-v2.3-2026-09-25')).toHaveLength(16);
        expect(promptKeyOf('a')).not.toBe(promptKeyOf('b'));
        const run = toAgreementRun(analysis());
        if (run === null) throw new Error('прогон не собрался');
        const pairs = [
            { key: 'b', first: run, second: run },
            { key: 'a', first: run, second: run },
        ];
        expect(pairsHashOf(pairs)).toBe(pairsHashOf([...pairs].reverse()));
    });

    it('toAgreementPair: любой из разборов не объект — пары нет', () => {
        expect(toAgreementPair('t', analysis(), null)).toBeNull();
        expect(toAgreementPair('t', analysis(), analysis())?.key).toBe('t');
    });
});
