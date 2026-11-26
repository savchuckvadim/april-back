import { fitCandidates, lineSet } from '../long-call-input-budget.util';
import type { ExcerptCandidate } from '../long-call-input.types';
import { FIXED_LINE_SIZE } from './long-call-input.fixture';

const sizeOf = (): number => FIXED_LINE_SIZE;

const candidate = (
    from: number,
    to: number,
    reason = 'x',
): ExcerptCandidate => ({
    source: 'event',
    range: { from, to },
    reason,
    heading: reason,
    span: null,
});

describe('fitCandidates — укладка в бюджет', () => {
    const input = {
        covered: new Set<number>(),
        usedChars: 0,
        sizeOf,
    };

    it('ранние: берём по порядку записи, пока помещаются', () => {
        const result = fitCandidates({
            ...input,
            candidates: [
                candidate(40, 42),
                candidate(10, 12),
                candidate(70, 72),
            ],
            budgetChars: 700,
            keep: 'earliest',
        });

        expect(result.kept.map(item => item.range.from)).toEqual([10, 40]);
        expect(result.dropped.map(item => item.range.from)).toEqual([70]);
        expect(result.usedChars).toBe(6 * FIXED_LINE_SIZE);
    });

    it('поздние: берём с конца записи', () => {
        const result = fitCandidates({
            ...input,
            candidates: [
                candidate(10, 12),
                candidate(40, 42),
                candidate(70, 72),
            ],
            budgetChars: 700,
            keep: 'latest',
        });

        expect(result.kept.map(item => item.range.from)).toEqual([70, 40]);
        expect(result.dropped.map(item => item.range.from)).toEqual([10]);
    });

    it('на первом, который не помещается, останавливаемся: меньшие следом не берутся', () => {
        const result = fitCandidates({
            ...input,
            candidates: [
                candidate(10, 12),
                candidate(20, 29),
                candidate(40, 40),
            ],
            budgetChars: 500,
            keep: 'earliest',
        });

        expect(result.kept.map(item => item.range.from)).toEqual([10]);
        expect(result.dropped).toHaveLength(2);
    });

    it('строки, уже вошедшие в отрывки, места не занимают и второй раз не считаются', () => {
        const result = fitCandidates({
            ...input,
            covered: lineSet([{ from: 10, to: 19 }]),
            candidates: [candidate(15, 22), candidate(21, 24)],
            budgetChars: 5 * FIXED_LINE_SIZE,
            keep: 'earliest',
        });

        expect(result.kept).toHaveLength(2);
        expect(result.usedChars).toBe(5 * FIXED_LINE_SIZE);
        expect([...result.covered].sort((a, b) => a - b)).toEqual([
            10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        ]);
    });

    it('занятый заранее бюджет учитывается', () => {
        const result = fitCandidates({
            ...input,
            usedChars: 900,
            candidates: [candidate(10, 12)],
            budgetChars: 1_000,
            keep: 'earliest',
        });

        expect(result.kept).toEqual([]);
        expect(result.dropped).toHaveLength(1);
    });

    it('исходные множества и список не меняются', () => {
        const covered = lineSet([{ from: 0, to: 2 }]);
        const candidates = [candidate(50, 52), candidate(10, 12)];
        fitCandidates({
            ...input,
            covered,
            candidates,
            budgetChars: 10_000,
            keep: 'earliest',
        });

        expect(covered.size).toBe(3);
        expect(candidates.map(item => item.range.from)).toEqual([50, 10]);
    });

    it('нечего укладывать — пусто', () => {
        const result = fitCandidates({
            ...input,
            candidates: [],
            budgetChars: 100,
            keep: 'earliest',
        });

        expect(result.kept).toEqual([]);
        expect(result.dropped).toEqual([]);
        expect(result.usedChars).toBe(0);
    });
});
