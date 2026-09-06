import {
    parseAnalysisFacts,
    parseClassifyCallType,
    parseDurationSec,
    versionKeyOf,
} from '../audit/ai-analytics-audit.parse';

describe('ai-analytics-audit.parse', () => {
    describe('versionKeyOf', () => {
        it('собирает пять версий в фиксированном порядке', () => {
            expect(
                versionKeyOf({
                    versions: {
                        classifier: 'e',
                        prompt: 'a',
                        rubric: 'b',
                        registry: 'c',
                        attribution: 'd',
                    },
                }),
            ).toBe('prompt=a;rubric=b;registry=c;attribution=d;classifier=e');
        });

        it('отсутствующие ключи versions помечает «?»', () => {
            expect(versionKeyOf({ versions: { prompt: 'a' } })).toBe(
                'prompt=a;rubric=?;registry=?;attribution=?;classifier=?',
            );
        });

        it('без versions берёт legacy agentVersion, иначе null', () => {
            expect(versionKeyOf({ agentVersion: 'internal-focus-v2' })).toBe(
                'agentVersion=internal-focus-v2',
            );
            expect(versionKeyOf({ agentVersion: '' })).toBeNull();
            expect(versionKeyOf({})).toBeNull();
        });
    });

    describe('parseAnalysisFacts', () => {
        it('не объект — null', () => {
            expect(parseAnalysisFacts(null)).toBeNull();
            expect(parseAnalysisFacts('text')).toBeNull();
            expect(parseAnalysisFacts([])).toBeNull();
        });

        it('считает nextStep, alternatives и quote', () => {
            const facts = parseAnalysisFacts({
                callType: 'presentation',
                agentVersion: 'v2',
                nextStep: { set: true, date: '2026-09-10' },
                sections: [
                    { section: 'GREETING', alternatives: ['фраза'] },
                    { section: 'NEEDS', alternatives: [] },
                    { section: 'PRICE', alternatives: [''] },
                    { section: 'CLOSING' },
                    'мусор',
                ],
                objections: [
                    { quote: 'дорого' },
                    { quote: '' },
                    { category: 'price' },
                ],
            });
            expect(facts).toEqual({
                callType: 'presentation',
                versionKey: 'agentVersion=v2',
                fields: {
                    nextStepSet: true,
                    nextStepDate: true,
                    sectionsTotal: 4,
                    sectionsWithAlternatives: 1,
                    objectionsTotal: 3,
                    objectionsWithQuote: 1,
                },
            });
        });

        it('пустой объект — нули и false', () => {
            expect(parseAnalysisFacts({})).toEqual({
                callType: null,
                versionKey: null,
                fields: {
                    nextStepSet: false,
                    nextStepDate: false,
                    sectionsTotal: 0,
                    sectionsWithAlternatives: 0,
                    objectionsTotal: 0,
                    objectionsWithQuote: 0,
                },
            });
        });

        it('nextStep.set не true — не считается установленным', () => {
            const facts = parseAnalysisFacts({
                nextStep: { set: 'yes', date: null },
            });
            expect(facts?.fields.nextStepSet).toBe(false);
            expect(facts?.fields.nextStepDate).toBe(false);
        });
    });

    describe('parseClassifyCallType', () => {
        it('user_result.callType приоритетнее колонки result', () => {
            expect(parseClassifyCallType({ callType: 'cold' }, 'call')).toBe(
                'cold',
            );
            expect(parseClassifyCallType({}, 'call')).toBe('call');
            expect(parseClassifyCallType(null, '')).toBeNull();
            expect(parseClassifyCallType(null, null)).toBeNull();
        });
    });

    describe('parseDurationSec', () => {
        it('строка секунд → число, мусор → null', () => {
            expect(parseDurationSec('600')).toBe(600);
            expect(parseDurationSec(' 12 ')).toBe(12);
            expect(parseDurationSec('')).toBeNull();
            expect(parseDurationSec('abc')).toBeNull();
            expect(parseDurationSec(null)).toBeNull();
        });
    });
});
