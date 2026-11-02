import { buildAttention } from '../model/attention';
import {
    progressWithoutQualityRule,
    weakSpiralsOf,
} from '../model/attention.rules.methodology';
import {
    ATTENTION_DEFAULT_RULES,
    type AttentionManagerInput,
} from '../model/attention.types';
import { rateMetric } from '../model/metric';

/**
 * Правила «Внимания» по фактам методики (02.11.2026): спирали презентации
 * внутри сигнала «слабые презентации» и сигнал «купил бы и без менеджера»
 * по звонкам с продвижением сделки без качества. Пороги — дефолты реестра:
 * качество от 6 из 10, движение сделки от 4 из 5, сигнал от 3 звонков,
 * минимум n презентаций — 8.
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

describe('weak_presentation: спирали презентации', () => {
    it('спирали ниже нормы при n ≥ 8 дают сигнал и при сильных разделах; звонки ниже нормы — в ссылке', () => {
        const [item] = buildAttention({
            managers: [
                manager({
                    presentation: {
                        n: 10,
                        sections: [
                            { section: 'NEEDS', mean: 7.5, n: 10 },
                            { section: 'PRESENTATION', mean: 7.2, n: 10 },
                        ],
                        weakCallIds: [],
                        spirals: {
                            n: 10,
                            meanFull: 1.2,
                            minFull: 3,
                            belowMinCallIds: ['p9', 'p2'],
                        },
                    },
                }),
            ],
        });
        expect(item.signal).toBe('weak_presentation');
        expect(item.headline).toBe(
            'Слабые презентации: полных спиралей в среднем 1,2 при норме 3 ' +
                '(меньше нормы в 2 из 10 презентаций) — в среднем по 10 разборам презентаций',
        );
        expect(item.basis).toEqual([
            { code: 'presentation_spirals_mean', value: 1.2, norm: 3, n: 10 },
        ]);
        expect(item.link).toEqual({
            managerId: 'm1',
            callType: 'presentation',
            transcriptionIds: ['p2', 'p9'],
        });
    });

    it('спирали в норме, мало презентаций, нет нормы или не считались — части по спиралям нет', () => {
        expect(
            weakSpiralsOf(
                { n: 10, meanFull: 3.2, minFull: 3, belowMinCallIds: [] },
                ATTENTION_DEFAULT_RULES,
            ),
        ).toBeNull();
        expect(
            weakSpiralsOf(
                { n: 5, meanFull: 1, minFull: 3, belowMinCallIds: ['a'] },
                ATTENTION_DEFAULT_RULES,
            ),
        ).toBeNull();
        expect(
            weakSpiralsOf(
                { n: 10, meanFull: 0, minFull: 0, belowMinCallIds: [] },
                ATTENTION_DEFAULT_RULES,
            ),
        ).toBeNull();
        expect(weakSpiralsOf(undefined, ATTENTION_DEFAULT_RULES)).toBeNull();
    });

    it('слабый раздел и спирали вместе: обе части в заголовке, опоры обеих, звонки объединены без дублей', () => {
        const [item] = buildAttention({
            managers: [
                manager({
                    presentation: {
                        n: 12,
                        sections: [{ section: 'NEEDS', mean: 4, n: 12 }],
                        weakCallIds: ['p1', 'p2'],
                        spirals: {
                            n: 12,
                            meanFull: 2,
                            minFull: 3,
                            belowMinCallIds: ['p2', 'p3'],
                        },
                    },
                }),
            ],
        });
        expect(item.headline).toContain(
            '«Выявление потребностей» 4,0 из 10, полных спиралей в среднем 2,0 при норме 3',
        );
        expect(item.basis.map(basis => basis.code)).toEqual([
            'needs_section_mean',
            'presentation_spirals_mean',
        ]);
        expect(item.link.transcriptionIds).toEqual(['p1', 'p2', 'p3']);
    });
});

describe('progress_without_quality', () => {
    const calls = [
        {
            transcriptionId: 'c3',
            callType: 'presentation',
            score: 5.5,
            dealProgress: 4,
        },
        {
            transcriptionId: 'c1',
            callType: 'refine',
            score: 4,
            dealProgress: 5,
        },
        {
            transcriptionId: 'c2',
            callType: 'presentation',
            score: 3.5,
            dealProgress: 4,
        },
    ];

    it('от трёх звонков с продвижением без качества — карточка после низких оценок, с числами и ссылкой', () => {
        const items = buildAttention({
            managers: [
                manager({
                    lowScoreCalls: [
                        { transcriptionId: 'l1', callType: 'cold', score: 3 },
                    ],
                    progress: { n: 12, calls },
                }),
            ],
        });
        expect(items.map(item => item.signal)).toEqual([
            'low_score_calls',
            'progress_without_quality',
        ]);
        const item = items[1];
        expect(item.headline).toBe(
            'Сделки движутся без качества: у 3 из 12 звонков, где сделка ' +
                'продвинулась, оценка ниже 6 из 10 — клиент купил бы и без ' +
                'менеджера; худшая — 3,5 из 10',
        );
        expect(item.basis).toEqual([
            { code: 'progress_no_quality_calls', value: 3, norm: 3, n: 12 },
        ]);
        expect(item.link).toEqual({
            managerId: 'm1',
            transcriptionIds: ['c1', 'c2', 'c3'],
        });
    });

    it('меньше порога звонков или фактов нет — правило молчит', () => {
        expect(
            progressWithoutQualityRule(
                manager({ progress: { n: 5, calls: calls.slice(0, 2) } }),
                ATTENTION_DEFAULT_RULES,
            ),
        ).toBeNull();
        expect(
            progressWithoutQualityRule(manager(), ATTENTION_DEFAULT_RULES),
        ).toBeNull();
    });

    it('порог звонков портала выше дефолта — три звонка сигнала не дают', () => {
        expect(
            buildAttention(
                { managers: [manager({ progress: { n: 12, calls } })] },
                { progressNoQualityMinCalls: 4 },
            ),
        ).toEqual([]);
    });
});
