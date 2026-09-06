import {
    AUDIT_RULES,
    buildThresholdRecommendation,
} from '../audit/ai-analytics-audit.recommend';

describe('buildThresholdRecommendation', () => {
    it('без данных — оба флага false, обе строки про отсутствие данных', () => {
        const result = buildThresholdRecommendation({
            analyzedInCellsPct: null,
            analyzedByManagerMonthPct: null,
            shortPct: null,
        });
        expect(result.lowerThresholds).toBe(false);
        expect(result.cheapShortContour).toBe(false);
        expect(result.lines).toHaveLength(2);
        expect(result.lines[0]).toContain('оценить нельзя');
        expect(result.lines[1]).toContain('отложить');
    });

    it('доля в ячейках ниже порога → пороги ниже', () => {
        const result = buildThresholdRecommendation({
            analyzedInCellsPct: 20,
            analyzedByManagerMonthPct: 55,
            shortPct: 10,
        });
        expect(result.lowerThresholds).toBe(true);
        expect(result.lines[0]).toContain('пороги ниже');
        expect(result.lines[0]).toContain('55 %');
    });

    it('граница: ровно cellShareMinPct — пороги оставить', () => {
        const result = buildThresholdRecommendation({
            analyzedInCellsPct: AUDIT_RULES.cellShareMinPct,
            analyzedByManagerMonthPct: null,
            shortPct: 10,
        });
        expect(result.lowerThresholds).toBe(false);
        expect(result.lines[0]).toContain('пороги 4.11 оставить');
    });

    it('доля коротких выше порога → дешёвый контур', () => {
        const result = buildThresholdRecommendation({
            analyzedInCellsPct: 50,
            analyzedByManagerMonthPct: 60,
            shortPct: 45,
        });
        expect(result.cheapShortContour).toBe(true);
        expect(result.lines[1]).toContain('дешёвый контур');
    });

    it('граница: ровно shortShareMaxPct — контур не нужен', () => {
        const result = buildThresholdRecommendation({
            analyzedInCellsPct: 50,
            analyzedByManagerMonthPct: 60,
            shortPct: AUDIT_RULES.shortShareMaxPct,
        });
        expect(result.cheapShortContour).toBe(false);
        expect(result.lines[1]).toContain('не требуется');
    });

    it('учитывает переданные правила', () => {
        const result = buildThresholdRecommendation(
            {
                analyzedInCellsPct: 50,
                analyzedByManagerMonthPct: null,
                shortPct: 25,
            },
            {
                cellMinN: 5,
                cellShareMinPct: 60,
                shortCallSec: 180,
                shortShareMaxPct: 20,
            },
        );
        expect(result.lowerThresholds).toBe(true);
        expect(result.cheapShortContour).toBe(true);
        expect(result.lines[1]).toContain('< 180 с');
    });
});
