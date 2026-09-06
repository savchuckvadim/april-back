import { buildAttention } from '../model/attention';
import { isCloser } from '../model/attention.rules';
import {
    ATTENTION_DEFAULT_RULES,
    AttentionManagerInput,
} from '../model/attention.types';
import { rateMetric } from '../model/metric';
import { mulberry32 } from './lite-row.fixture';

const quiet: AttentionManagerInput['discipline'] = {
    callPlan: 0,
    callDone: 0,
    presentationPlan: 0,
    presentationDone: 0,
};

const manager = (
    patch: Partial<AttentionManagerInput> = {},
): AttentionManagerInput => ({
    managerId: 'm1',
    n: 30,
    nextStepRate: { current: rateMetric(20, 40), previous: rateMetric(20, 40) },
    riskCalls: [],
    discipline: quiet,
    ...patch,
});

const signalsOf = (managers: AttentionManagerInput[]) =>
    buildAttention({ managers }).map(item => item.signal);

describe('buildAttention: правила Фазы 1', () => {
    it('risk — риск-звонки окна, виды по алфавиту, id звонков в link', () => {
        const [item] = buildAttention({
            managers: [
                manager({
                    riskCalls: [
                        { transcriptionId: 't2', kind: 'conflict' },
                        { transcriptionId: 't1', kind: 'promise' },
                    ],
                }),
            ],
        });
        expect(item).toEqual({
            managerId: 'm1',
            rank: 1,
            signal: 'risk',
            availableFrom: 1,
            headline: 'Риск-сигналы: 2 (conflict, promise)',
            basis: [{ code: 'risk_calls', value: 2, n: 30 }],
            link: { managerId: 'm1', transcriptionIds: ['t1', 't2'] },
        });
    });

    it('no_data — n < 8 при звонках в телефонии; при callsTotal = 0 не ставится', () => {
        const [withCalls] = buildAttention({
            managers: [manager({ n: 3, callsTotal: 25 })],
        });
        expect(withCalls.signal).toBe('no_data');
        expect(withCalls.headline).toBe('Мало разборов: n = 3 при 25 звонках');
        expect(withCalls.basis).toEqual([
            { code: 'analyzed_calls', value: 3, norm: 8, n: 3 },
            { code: 'calls_total', value: 25, n: 25 },
        ]);
        expect(signalsOf([manager({ n: 3 })])).toEqual(['no_data']);
        expect(signalsOf([manager({ n: 3, callsTotal: 0 })])).toEqual([]);
        expect(signalsOf([manager({ n: 8, callsTotal: 25 })])).toEqual([]);
    });

    it('discipline — < 50 % плана CRM при плане ≥ 10, по звонкам и презентациям', () => {
        const [item] = buildAttention({
            managers: [
                manager({
                    discipline: {
                        callPlan: 20,
                        callDone: 4,
                        presentationPlan: 12,
                        presentationDone: 5,
                    },
                }),
            ],
        });
        expect(item.signal).toBe('discipline');
        expect(item.headline).toBe(
            'Дисциплина CRM: звонки 4 из 20 (20 %), презентации 5 из 12 (42 %)',
        );
        expect(item.basis).toEqual([
            { code: 'call_plan_done_share', value: 0.2, norm: 0.5, n: 20 },
            {
                code: 'presentation_plan_done_share',
                value: 5 / 12,
                norm: 0.5,
                n: 12,
            },
        ]);
        expect(item.link).toEqual({ managerId: 'm1', callType: 'call' });
        expect(
            signalsOf([
                manager({ discipline: { ...quiet, callPlan: 9, callDone: 0 } }),
            ]),
        ).toEqual([]);
        expect(
            signalsOf([
                manager({
                    discipline: { ...quiet, callPlan: 20, callDone: 10 },
                }),
            ]),
        ).toEqual([]);
    });

    it('правило «закрывателя»: discipline не ставится, если исходы не ниже норм уровня', () => {
        const lowDiscipline = { ...quiet, callPlan: 20, callDone: 2 };
        const closer = manager({
            discipline: lowDiscipline,
            outcomes: { invoices: 5, deals: 2 },
            levelNorms: { invoices: 4, deals: 2 },
        });
        expect(isCloser(closer)).toBe(true);
        expect(signalsOf([closer])).toEqual([]);
        const below = manager({
            discipline: lowDiscipline,
            outcomes: { invoices: 3, deals: 2 },
            levelNorms: { invoices: 4, deals: 2 },
        });
        expect(isCloser(below)).toBe(false);
        expect(signalsOf([below])).toEqual(['discipline']);
        expect(
            isCloser(
                manager({
                    outcomes: { invoices: 9, deals: 9 },
                    levelNorms: {},
                }),
            ),
        ).toBe(false);
        expect(isCloser(manager({ outcomes: { invoices: 9, deals: 9 } }))).toBe(
            false,
        );
    });

    it('next_step_drop — n ≥ 20 в обоих окнах и непересекающиеся 90 %-интервалы, только падение', () => {
        const drop = manager({
            nextStepRate: {
                current: rateMetric(10, 40),
                previous: rateMetric(30, 40),
            },
        });
        const [item] = buildAttention({ managers: [drop] });
        expect(item.signal).toBe('next_step_drop');
        expect(item.headline).toBe('Доля шага с датой упала: 75 % → 25 %');
        expect(item.basis[0]).toEqual(
            expect.objectContaining({
                code: 'next_step_date_rate',
                value: 0.25,
                norm: 0.75,
                n: 40,
            }),
        );
        expect(item.basis[0].ci90).toEqual(rateMetric(10, 40).ci90);
        expect(item.basis[1].code).toBe('next_step_date_rate_prev');
        const rise = manager({
            nextStepRate: {
                current: rateMetric(30, 40),
                previous: rateMetric(10, 40),
            },
        });
        expect(signalsOf([rise])).toEqual([]);
        const thin = manager({
            nextStepRate: {
                current: rateMetric(5, 19),
                previous: rateMetric(30, 40),
            },
        });
        expect(signalsOf([thin])).toEqual([]);
        const overlap = manager({
            nextStepRate: {
                current: rateMetric(18, 40),
                previous: rateMetric(22, 40),
            },
        });
        expect(signalsOf([overlap])).toEqual([]);
    });

    it('plan_gap — план руководителя отличается от нормы на ≥ 50 %', () => {
        const [above] = buildAttention({
            managers: [manager({ planGap: { norm: 12, planHead: 30 } })],
        });
        expect(above.signal).toBe('plan_gap');
        expect(above.headline).toBe(
            'План руководителя 30 выше нормы 12 (×2,5)',
        );
        expect(above.basis).toEqual([
            { code: 'plan_head', value: 30, norm: 12, n: 0 },
        ]);
        const [below] = buildAttention({
            managers: [manager({ planGap: { norm: 12, planHead: 5 } })],
        });
        expect(below.headline).toBe('План руководителя 5 ниже нормы 12 (×0,4)');
        expect(
            signalsOf([manager({ planGap: { norm: 12, planHead: 14 } })]),
        ).toEqual([]);
        expect(
            signalsOf([manager({ planGap: { norm: 0, planHead: 14 } })]),
        ).toEqual([]);
    });
});

describe('buildAttention: лимиты, порядок, детерминизм', () => {
    const everything = (managerId: string): AttentionManagerInput =>
        manager({
            managerId,
            n: 3,
            callsTotal: 20,
            riskCalls: [{ transcriptionId: `${managerId}-r`, kind: 'promise' }],
            discipline: { ...quiet, callPlan: 20, callDone: 2 },
            nextStepRate: {
                current: rateMetric(10, 40),
                previous: rateMetric(30, 40),
            },
            planGap: { norm: 10, planHead: 30 },
        });

    it('≤ 3 карточек на менеджера в порядке приоритета сигналов', () => {
        const items = buildAttention({ managers: [everything('m1')] });
        expect(items.map(item => item.signal)).toEqual([
            'risk',
            'no_data',
            'discipline',
        ]);
        expect(items.map(item => item.rank)).toEqual([1, 2, 3]);
        expect(ATTENTION_DEFAULT_RULES.maxPerManager).toBe(3);
    });

    it('≤ 7 карточек всего; сначала все risk, тяжесть, затем managerId', () => {
        const managers = ['m5', 'm3', 'm1', 'm4', 'm2'].map(everything);
        managers[1].riskCalls.push({
            transcriptionId: 'm3-r2',
            kind: 'conflict',
        });
        const items = buildAttention({ managers });
        expect(items).toHaveLength(7);
        expect(items.map(item => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(items.map(item => `${item.signal}:${item.managerId}`)).toEqual([
            'risk:m3',
            'risk:m1',
            'risk:m2',
            'risk:m4',
            'risk:m5',
            'no_data:m1',
            'no_data:m2',
        ]);
    });

    it('лимиты настраиваются через rules', () => {
        const items = buildAttention(
            { managers: ['m1', 'm2'].map(everything) },
            { maxItems: 3, maxPerManager: 1 },
        );
        expect(items.map(item => `${item.signal}:${item.managerId}`)).toEqual([
            'risk:m1',
            'risk:m2',
        ]);
    });

    it('детерминизм: обратный порядок входа и повторный вызов дают тот же результат', () => {
        const managers = ['m1', 'm2', 'm3'].map(everything);
        const direct = buildAttention({ managers });
        expect(buildAttention({ managers: [...managers].reverse() })).toEqual(
            direct,
        );
        expect(buildAttention({ managers })).toEqual(direct);
    });

    it('перемешанные данные: одинаковая доля в обоих окнах даёт ≤ 1 карточки сравнения', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const random = mulberry32(seed);
            const pool = Array.from({ length: 8 * 80 }, () =>
                random() < 0.5 ? 1 : 0,
            );
            const managers = Array.from({ length: 8 }, (_, index) => {
                const slice = pool.slice(index * 80, index * 80 + 80);
                const hits = (part: number[]): number =>
                    part.reduce((acc, value) => acc + value, 0);
                return manager({
                    managerId: `m${index + 1}`,
                    n: 40,
                    nextStepRate: {
                        current: rateMetric(hits(slice.slice(0, 40)), 40),
                        previous: rateMetric(hits(slice.slice(40)), 40),
                    },
                });
            });
            const comparisons = buildAttention({ managers }).filter(
                item => item.signal === 'next_step_drop',
            );
            expect(comparisons.length).toBeLessThanOrEqual(1);
        }
    });

    it('пустой вход → пусто', () => {
        expect(buildAttention({ managers: [] })).toEqual([]);
    });
});
