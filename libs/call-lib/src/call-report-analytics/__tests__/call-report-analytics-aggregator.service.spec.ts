import { CallReportAnalyticsAggregatorService } from '../services/call-report-analytics-aggregator.service';
import { AnalyticsCallRow } from '../services/call-report-analytics-data.service';

const aggregator = new CallReportAnalyticsAggregatorService();

const row = (overrides: Partial<AnalyticsCallRow> = {}): AnalyticsCallRow => ({
    transcriptionId: '1',
    callStartedAt: new Date('2026-07-10T10:00:00Z'),
    durationSec: 600,
    managerId: '7',
    callType: 'cold',
    analysis: null,
    classification: null,
    ...overrides,
});

describe('CallReportAnalyticsAggregatorService', () => {
    describe('buildSummary', () => {
        it('считает типы, менеджеров, результативность и средние', () => {
            const body = aggregator.buildSummary([
                row({
                    analysis: {
                        productive: true,
                        score: 8,
                        weightedScore: 80,
                        nextStep: { set: true },
                    },
                }),
                row({
                    transcriptionId: '2',
                    managerId: '15',
                    callType: 'presentation',
                    durationSec: 1200,
                    analysis: {
                        productive: false,
                        score: 4,
                        weightedScore: 40,
                        nextStep: { set: false },
                    },
                }),
                row({
                    transcriptionId: '3',
                    managerId: null,
                    callType: null,
                    durationSec: null,
                }),
            ]);

            expect(body.byCallType).toEqual({
                cold: 1,
                presentation: 1,
                unknown: 1,
            });
            expect(body.byManager).toEqual({ '7': 1, '15': 1, unknown: 1 });
            expect(body.productivity).toEqual({
                productive: 1,
                nonProductive: 1,
                unknown: 1,
            });
            expect(body.avgScore).toBe(6);
            expect(body.avgWeightedScore).toBe(60);
            expect(body.nextStepSetRatePct).toBe(50);
            expect(body.avgDurationSec).toBe(900);
        });

        it('пустой период — нули и null-средние', () => {
            const body = aggregator.buildSummary([]);
            expect(body.byCallType).toEqual({});
            expect(body.avgScore).toBeNull();
            expect(body.nextStepSetRatePct).toBeNull();
        });
    });

    describe('buildSpeech', () => {
        it('норма talkRatio берётся из профиля ТИПА звонка', () => {
            const body = aggregator.buildSpeech([
                // cold: норма 30-55 → 70 вне нормы
                row({ analysis: { talkRatioPct: 70 } }),
                // presentation: норма 50-70 → 65 в норме
                row({
                    transcriptionId: '2',
                    callType: 'presentation',
                    analysis: { talkRatioPct: 65 },
                }),
                // payment: нормы нет → не учитывается
                row({
                    transcriptionId: '3',
                    callType: 'payment',
                    analysis: { talkRatioPct: 99 },
                }),
            ]);
            expect(body.talkRatioOutOfNorm).toBe(1);
            expect(body.avgTalkRatioPct).toBe(78);
        });

        it('усредняет разделы только по relevance>0, в каноническом порядке', () => {
            const body = aggregator.buildSpeech([
                row({
                    analysis: {
                        sections: [
                            {
                                section: 'OBJECTIONS',
                                relevance: 80,
                                score: 6,
                            },
                            { section: 'GREETING', relevance: 100, score: 8 },
                            { section: 'PRICE', relevance: 0, score: 1 },
                        ],
                    },
                }),
                row({
                    transcriptionId: '2',
                    analysis: {
                        sections: [
                            { section: 'GREETING', relevance: 90, score: 4 },
                        ],
                    },
                }),
            ]);
            expect(body.sections.map(section => section.section)).toEqual([
                'GREETING',
                'OBJECTIONS',
            ]);
            const greeting = body.sections[0];
            expect(greeting.avgScore).toBe(6);
            expect(greeting.count).toBe(2);
        });
    });

    describe('buildObjections', () => {
        it('считает частоты и долю отработанных возражений', () => {
            const body = aggregator.buildObjections([
                row({
                    analysis: {
                        objectionCategories: ['price', 'need'],
                        competitors: ['consultant'],
                        riskFlags: ['promise'],
                        refusalCategory: 'price',
                        objections: [
                            { objection: 'дорого', handled: true },
                            { objection: 'не надо', handled: false },
                        ],
                    },
                }),
                row({
                    transcriptionId: '2',
                    analysis: {
                        objectionCategories: ['price'],
                        objections: [{ objection: 'дорого', handled: false }],
                    },
                }),
            ]);
            expect(body.objectionCategories).toEqual({ price: 2, need: 1 });
            expect(body.handledRatePct).toBe(33);
            expect(body.competitors).toEqual({ consultant: 1 });
            expect(body.riskFlags).toEqual({ promise: 1 });
            expect(body.refusalCategories).toEqual({ price: 1 });
        });
    });

    describe('buildManagers', () => {
        it('группирует по менеджеру и сортирует по взвешенной оценке', () => {
            const body = aggregator.buildManagers([
                row({
                    analysis: {
                        weightedScore: 40,
                        productive: false,
                        talkRatioPct: 60,
                    },
                }),
                row({
                    transcriptionId: '2',
                    managerId: '15',
                    analysis: {
                        weightedScore: 80,
                        productive: true,
                        talkRatioPct: 50,
                    },
                }),
                row({ transcriptionId: '3', managerId: null }),
            ]);
            expect(body.managers.map(manager => manager.managerId)).toEqual([
                '15',
                '7',
                'unknown',
            ]);
            expect(body.managers[0]).toEqual({
                managerId: '15',
                calls: 1,
                analyzed: 1,
                avgWeightedScore: 80,
                productiveRatePct: 100,
                avgTalkRatioPct: 50,
            });
            expect(body.managers[2].analyzed).toBe(0);
            expect(body.managers[2].avgWeightedScore).toBeNull();
        });
    });
});
