import { buildAttention } from '../model/attention';
import {
    ATTENTION_QUALITY_BASIS_CODES,
    departmentSectionBenchmarks,
    weakSectionsOf,
} from '../model/attention.rules.quality';
import {
    ATTENTION_DEFAULT_RULES,
    ATTENTION_SIGNALS,
    type AttentionManagerInput,
} from '../model/attention.types';
import { rateMetric } from '../model/metric';

/**
 * Правила «Внимания» этапа 2 (решение владельца 19.10.2026): слабые
 * презентации → слабая доработка → звонки с низкой оценкой — впереди
 * остальных, риск последним. Пороги — дефолты реестра: раздел слабый при
 * средней ≤ 5 или ниже отдела на ≥ 1 балл при n ≥ 8; звонок слабый при
 * оценке ≤ 4.
 */
const manager = (
    patch: Partial<AttentionManagerInput> = {},
): AttentionManagerInput => ({
    managerId: 'm1',
    n: 30,
    nextStepRate: { current: rateMetric(20, 40), previous: rateMetric(20, 40) },
    riskCalls: [],
    discipline: {
        callPlan: 0,
        callDone: 0,
        presentationPlan: 0,
        presentationDone: 0,
    },
    ...patch,
});

const quietFollowup = {
    n: 12,
    objectionsKnown: 10,
    objectionsUnhandled: 1,
    nextStepSet: 10,
    nextStepNoDate: 1,
    sections: [
        { section: 'OBJECTIONS', mean: 7.5, n: 12 },
        { section: 'CLOSING', mean: 7, n: 12 },
    ],
    weakCallIds: [],
};

describe('weak_presentation', () => {
    it('средняя раздела не выше порога при n ≥ 8 — карточка с названием раздела и числами', () => {
        const [item] = buildAttention({
            managers: [
                manager({
                    presentation: {
                        n: 12,
                        sections: [
                            { section: 'NEEDS', mean: 4.25, n: 12 },
                            { section: 'PRESENTATION', mean: 7.4, n: 12 },
                        ],
                        weakCallIds: ['p2', 'p1'],
                    },
                }),
            ],
        });
        expect(item.signal).toBe('weak_presentation');
        expect(item.headline).toBe(
            'Слабые презентации: «Выявление потребностей» 4,3 из 10 — в среднем по 12 разборам презентаций',
        );
        expect(item.basis).toEqual([
            {
                code: ATTENTION_QUALITY_BASIS_CODES.NEEDS,
                value: 4.25,
                norm: ATTENTION_DEFAULT_RULES.weakSectionScoreMax,
                n: 12,
            },
        ]);
        expect(item.link).toEqual({
            managerId: 'm1',
            callType: 'presentation',
            transcriptionIds: ['p1', 'p2'],
        });
    });

    it('не срабатывает: средняя выше порога, n раздела меньше 8, фактов нет', () => {
        const signals = (patch: Partial<AttentionManagerInput>) =>
            buildAttention({ managers: [manager(patch)] }).map(i => i.signal);
        expect(
            signals({
                presentation: {
                    n: 12,
                    sections: [{ section: 'NEEDS', mean: 5.1, n: 12 }],
                    weakCallIds: [],
                },
            }),
        ).toEqual([]);
        expect(
            signals({
                presentation: {
                    n: 7,
                    sections: [{ section: 'NEEDS', mean: 2, n: 7 }],
                    weakCallIds: ['x'],
                },
            }),
        ).toEqual([]);
        expect(signals({})).toEqual([]);
    });

    it('ниже отдела на разрыв и больше — срабатывает даже при средней выше порога; отдел — по всем менеджерам', () => {
        const low = manager({
            managerId: 'low',
            presentation: {
                n: 10,
                sections: [{ section: 'PRESENTATION', mean: 6, n: 10 }],
                weakCallIds: [],
            },
        });
        const high = manager({
            managerId: 'high',
            presentation: {
                n: 30,
                sections: [{ section: 'PRESENTATION', mean: 8, n: 30 }],
                weakCallIds: [],
            },
        });
        // Отдел: (6·10 + 8·30) / 40 = 7,5 → разрыв 1,5 ≥ 1.
        const items = buildAttention({ managers: [low, high] });
        expect(items.map(item => `${item.signal}:${item.managerId}`)).toEqual([
            'weak_presentation:low',
        ]);
        expect(items[0].headline).toBe(
            'Слабые презентации: «Презентация под потребности» 6,0 из 10 (у отдела 7,5) — в среднем по 10 разборам презентаций',
        );
        expect(items[0].basis[0]).toEqual({
            code: ATTENTION_QUALITY_BASIS_CODES.PRESENTATION,
            value: 6,
            norm: 7.5,
            n: 10,
        });
        // Разрыв меньше порога — тихо.
        expect(
            buildAttention(
                {
                    managers: [low, high],
                },
                { weakSectionGap: 2 },
            ),
        ).toEqual([]);
        // Один менеджер в периметре — отдел это он сам, разрыв ноль.
        expect(buildAttention({ managers: [low] })).toEqual([]);
    });

    it('departmentSectionBenchmarks и weakSectionsOf — взвешенные средние и порог n ориентира', () => {
        const benchmarks = departmentSectionBenchmarks([
            manager({
                presentation: {
                    n: 4,
                    sections: [{ section: 'NEEDS', mean: 4, n: 4 }],
                    weakCallIds: [],
                },
            }),
            manager({
                managerId: 'm2',
                followup: {
                    ...quietFollowup,
                    sections: [{ section: 'CLOSING', mean: 6, n: 6 }],
                },
            }),
        ]);
        expect(benchmarks).toEqual([
            { section: 'CLOSING', mean: 6, n: 6 },
            { section: 'NEEDS', mean: 4, n: 4 },
        ]);
        // Ориентир с n < 8 не учитывается: раздел 6,5 при отделе 4 не слаб,
        // а раздел 6,5 при отделе 8 с n ≥ 8 — слаб.
        expect(
            weakSectionsOf(
                [{ section: 'NEEDS', mean: 6.5, n: 10 }],
                [{ section: 'NEEDS', mean: 8, n: 4 }],
                ['NEEDS'],
                ATTENTION_DEFAULT_RULES,
            ),
        ).toEqual([]);
        expect(
            weakSectionsOf(
                [{ section: 'NEEDS', mean: 6.5, n: 10 }],
                [{ section: 'NEEDS', mean: 8, n: 8 }],
                ['NEEDS'],
                ATTENTION_DEFAULT_RULES,
            ),
        ).toHaveLength(1);
    });
});

describe('weak_followup', () => {
    it('возражения не отработаны в половине случаев и чаще — карточка с долями', () => {
        const [item] = buildAttention({
            managers: [
                manager({
                    followup: {
                        ...quietFollowup,
                        objectionsKnown: 10,
                        objectionsUnhandled: 6,
                        weakCallIds: ['f1'],
                    },
                }),
            ],
        });
        expect(item.signal).toBe('weak_followup');
        expect(item.headline).toBe(
            'Слабая доработка: возражения не отработаны в 60 % случаев (6 из 10) — по 12 разборам доработки',
        );
        expect(item.basis).toEqual([
            {
                code: ATTENTION_QUALITY_BASIS_CODES.objectionUnhandledShare,
                value: 0.6,
                norm: 0.5,
                n: 10,
            },
        ]);
        expect(item.link).toEqual({
            managerId: 'm1',
            callType: 'refine',
            transcriptionIds: ['f1'],
        });
    });

    it('шаг без даты в половине звонков и слабое «Закрытие разговора» — обе причины в заголовке', () => {
        const [item] = buildAttention({
            managers: [
                manager({
                    followup: {
                        ...quietFollowup,
                        nextStepSet: 8,
                        nextStepNoDate: 4,
                        sections: [
                            { section: 'OBJECTIONS', mean: 7.5, n: 12 },
                            { section: 'CLOSING', mean: 3.9, n: 12 },
                        ],
                    },
                }),
            ],
        });
        expect(item.headline).toBe(
            'Слабая доработка: следующий шаг без даты в 50 % звонков (4 из 8), «Закрытие разговора» 3,9 из 10 — по 12 разборам доработки',
        );
        expect(item.basis.map(basis => basis.code)).toEqual([
            ATTENTION_QUALITY_BASIS_CODES.nextStepNoDateShare,
            ATTENTION_QUALITY_BASIS_CODES.CLOSING,
        ]);
        expect(item.link.transcriptionIds).toBeUndefined();
    });

    it('не срабатывает: доли ниже половины, разделы в норме, знаменатели меньше 8', () => {
        expect(
            buildAttention({
                managers: [manager({ followup: quietFollowup })],
            }),
        ).toEqual([]);
        expect(
            buildAttention({
                managers: [
                    manager({
                        followup: {
                            ...quietFollowup,
                            objectionsKnown: 7,
                            objectionsUnhandled: 7,
                            nextStepSet: 7,
                            nextStepNoDate: 7,
                        },
                    }),
                ],
            }),
        ).toEqual([]);
    });
});

describe('low_score_calls', () => {
    it('звонки с оценкой не выше порога — число, худшая оценка, id в link', () => {
        const [item] = buildAttention({
            managers: [
                manager({
                    lowScoreCalls: [
                        { transcriptionId: 'c2', callType: 'cold', score: 3.5 },
                        { transcriptionId: 'c1', callType: null, score: 4 },
                        // Выше порога — правило отфильтрует само.
                        { transcriptionId: 'c3', callType: 'call', score: 4.5 },
                    ],
                }),
            ],
        });
        expect(item.signal).toBe('low_score_calls');
        expect(item.headline).toBe(
            'Звонки с низкой оценкой: 2 из 30 (оценка не выше 4 из 10), худший — 3,5 из 10',
        );
        expect(item.basis).toEqual([
            {
                code: ATTENTION_QUALITY_BASIS_CODES.lowScoreCalls,
                value: 2,
                norm: 4,
                n: 30,
            },
        ]);
        expect(item.link).toEqual({
            managerId: 'm1',
            transcriptionIds: ['c1', 'c2'],
        });
    });

    it('порог настраивается; пустой список и список выше порога — тихо', () => {
        const calls = [{ transcriptionId: 'c1', callType: null, score: 5 }];
        expect(
            buildAttention({ managers: [manager({ lowScoreCalls: calls })] }),
        ).toEqual([]);
        expect(
            buildAttention(
                { managers: [manager({ lowScoreCalls: calls })] },
                { lowScoreCallMax: 5 },
            ).map(item => item.signal),
        ).toEqual(['low_score_calls']);
        expect(
            buildAttention({ managers: [manager({ lowScoreCalls: [] })] }),
        ).toEqual([]);
    });
});

describe('порядок сигналов этапа 2', () => {
    it('презентации → доработка → низкая оценка → данные и план → риск последним; Фаза 3 после', () => {
        expect(ATTENTION_SIGNALS).toEqual([
            'weak_presentation',
            'weak_followup',
            'low_score_calls',
            'no_data',
            'discipline',
            'next_step_drop',
            'plan_gap',
            'risk',
            'goodhart',
            'trend_shift',
            'trend_drift',
        ]);
        const items = buildAttention(
            {
                managers: [
                    manager({
                        riskCalls: [{ transcriptionId: 'r', kind: 'conflict' }],
                        lowScoreCalls: [
                            { transcriptionId: 'c', callType: null, score: 2 },
                        ],
                        followup: {
                            ...quietFollowup,
                            objectionsUnhandled: 9,
                        },
                        presentation: {
                            n: 9,
                            sections: [{ section: 'NEEDS', mean: 3, n: 9 }],
                            weakCallIds: ['p'],
                        },
                    }),
                ],
            },
            { maxPerManager: 10 },
        );
        expect(items.map(item => item.signal)).toEqual([
            'weak_presentation',
            'weak_followup',
            'low_score_calls',
            'risk',
        ]);
        for (const item of items) {
            // Тексты без кодов, латиницы и знаков (правило владельца).
            expect(item.headline).not.toMatch(/[→×÷=_]|[a-z]{3,}/i);
        }
    });
});
