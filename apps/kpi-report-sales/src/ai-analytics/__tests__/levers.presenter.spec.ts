import { type LeverCandidate, leverKeyOf } from '@lib/sales-ai-analytics';
import {
    applyLeverMarks,
    toRecommendations,
} from '../domain/presenter/levers.presenter';
import {
    leverFeedbackMarks,
    leverFeedbackObject,
    periodLeverFeedbackMarks,
} from '../domain/use-cases/feedback-lever.util';
import type { AiManagerRowDto } from '../dto/ai-manager-row.dto';

const lever = (overrides: Partial<LeverCandidate> = {}): LeverCandidate => ({
    lever: 'volume',
    ruleCode: 'volume-below-capacity',
    deltaSales: 1.2,
    ci80: [0.4, 2],
    cost: 90,
    evidence: 'E1',
    adviceAllowed: false,
    basis: ['+30 cold', 'продаж на активность 0,04'],
    ...overrides,
});

const forecastWith = (levers: unknown) => ({ levers });

describe('toRecommendations — рычаги прогноза в строку менеджера', () => {
    it('топ-3 рычага с основанием, кодом правила и уровнем доказательности', () => {
        const result = toRecommendations(
            forecastWith([
                lever(),
                lever({
                    lever: 'checklist',
                    ruleCode: 'checklist-item-missing',
                    section: 'NEXT_STEP',
                    deltaSales: 0.8,
                    evidence: 'E0',
                }),
                lever({
                    lever: 'pipeline',
                    ruleCode: 'pipeline-stuck-deals',
                    deltaSales: 0.5,
                }),
                lever({
                    lever: 'objection',
                    ruleCode: 'objection-worst-outcome',
                    category: 'price',
                }),
            ]),
            { n: 40 },
        );

        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({
            lever: 'volume',
            ruleCode: 'volume-below-capacity',
            evidence: 'E1',
            cost: 90,
        });
        expect(result[0].basis).toEqual([
            '+30 cold',
            'продаж на активность 0,04',
        ]);
        expect(result[1]).toMatchObject({
            lever: 'checklist',
            section: 'NEXT_STEP',
            evidence: 'E0',
        });
    });

    it('разборов меньше n_min_none → список пуст', () => {
        expect(toRecommendations(forecastWith([lever()]), { n: 7 })).toEqual(
            [],
        );
        expect(toRecommendations(forecastWith([lever()]), {})).toEqual([]);
    });

    it('прогноза нет или рычагов в нём нет → список пуст', () => {
        expect(toRecommendations(null, { n: 40 })).toEqual([]);
        expect(toRecommendations(undefined, { n: 40 })).toEqual([]);
        expect(toRecommendations(forecastWith(undefined), { n: 40 })).toEqual(
            [],
        );
        expect(toRecommendations(forecastWith('нет'), { n: 40 })).toEqual([]);
    });

    it('совет по качеству ниже уровня совета (E1) — без числа эффекта, с уровня E2 — с числом', () => {
        const [observed] = toRecommendations(
            forecastWith([
                lever({
                    lever: 'quality',
                    ruleCode: 'quality-section-gap',
                    section: 'NEEDS',
                    deltaSales: 0.7,
                    evidence: 'E1',
                    adviceAllowed: false,
                }),
            ]),
            { n: 40 },
        );
        expect(observed.lever).toBe('quality');
        expect(observed.evidence).toBe('E1');
        expect(observed).not.toHaveProperty('deltaSales');

        const [advice] = toRecommendations(
            forecastWith([
                lever({
                    lever: 'quality',
                    ruleCode: 'quality-section-gap',
                    deltaSales: 0.7,
                    evidence: 'E2',
                    adviceAllowed: true,
                }),
            ]),
            { n: 40 },
        );
        expect(advice.deltaSales).toBe(0.7);

        // Объём — арифметика по своей конверсии менеджера, число остаётся.
        const [volume] = toRecommendations(forecastWith([lever()]), { n: 40 });
        expect(volume.deltaSales).toBe(1.2);
    });

    it('рычаг без ожидаемого эффекта отдаётся без числа (уровень E0)', () => {
        const [item] = toRecommendations(
            forecastWith([
                lever({ deltaSales: null, ci80: null, evidence: 'E0' }),
            ]),
            { n: 40 },
        );

        expect(item.deltaSales).toBeUndefined();
        expect(item.evidence).toBe('E0');
    });

    it('чужая форма кандидата отбрасывается, известные поля не теряются', () => {
        const result = toRecommendations(
            forecastWith([
                { lever: 'магия', ruleCode: 'x' },
                { lever: 'quality', ruleCode: 'quality-weak-section' },
                null,
                lever({ evidence: 'E7' as never, basis: ['ок', 5] as never }),
            ]),
            { n: 40 },
        );

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            lever: 'quality',
            cost: 0,
            evidence: 'E0',
            basis: [],
        });
        expect(result[1].evidence).toBe('E0');
        expect(result[1].basis).toEqual(['ок']);
    });

    it('порог показа и число рычагов настраиваются вызовом', () => {
        expect(
            toRecommendations(forecastWith([lever(), lever()]), {
                n: 4,
                minN: 3,
                max: 1,
            }),
        ).toHaveLength(1);
    });

    it('ключ совета — leverKeyOf по частям кандидата; без отметок done = false, issuedAt = null', () => {
        const [item] = toRecommendations(
            forecastWith([
                lever({
                    lever: 'checklist',
                    ruleCode: 'checklist-item-missing',
                    callType: 'presentation',
                    section: 'NEXT_STEP',
                }),
            ]),
            { n: 40 },
        );

        expect(item.key).toBe(
            leverKeyOf({
                lever: 'checklist',
                ruleCode: 'checklist-item-missing',
                callType: 'presentation',
                section: 'NEXT_STEP',
            }),
        );
        expect(item.key).toBe(
            'checklist:checklist-item-missing:presentation:NEXT_STEP:',
        );
        expect(item.done).toBe(false);
        expect(item.issuedAt).toBeNull();
    });

    it('один и тот же рычаг каждую ночь получает тот же ключ; пустые части = отсутствующие', () => {
        const [first] = toRecommendations(forecastWith([lever()]), { n: 40 });
        const [again] = toRecommendations(
            forecastWith([lever({ deltaSales: 0.3, section: '' })]),
            { n: 40 },
        );
        expect(first.key).toBe('volume:volume-below-capacity:::');
        expect(again.key).toBe(first.key);
    });
});

describe('applyLeverMarks — «Сделано» и день выдачи на советах строки', () => {
    const row = (managerId: string): AiManagerRowDto =>
        ({
            managerId,
            recommendations: toRecommendations(
                forecastWith([
                    lever(),
                    lever({
                        lever: 'quality',
                        ruleCode: 'quality-weak-section',
                    }),
                ]),
                { n: 40 },
            ),
        }) as unknown as AiManagerRowDto;

    it('обзор прошлого периода: «Сделано» после конца периода засчитывается, день выдачи — только из периода', () => {
        const [volume] = toRecommendations(forecastWith([lever()]), { n: 40 });
        const object = leverFeedbackObject('10', volume.key);
        // Период — сентябрь; «Сделано» нажали 2 октября, открыв обзор сентября.
        const periodEnd = new Date('2026-09-30T20:59:59.999Z');
        const marks = periodLeverFeedbackMarks(
            [
                {
                    kind: 'recommendation_issued',
                    object,
                    payload: { day: '2026-09-29' },
                    createdAt: new Date('2026-09-29T01:00:00Z'),
                },
                {
                    kind: 'recommendation_done',
                    object,
                    createdAt: new Date('2026-10-02T09:00:00Z'),
                },
                // Совет выдан снова уже в октябре — дню выдачи сентября не мешает.
                {
                    kind: 'recommendation_issued',
                    object,
                    payload: { day: '2026-10-01' },
                    createdAt: new Date('2026-10-01T01:00:00Z'),
                },
            ],
            periodEnd,
        );

        expect(marks.done.has(object)).toBe(true);
        expect(marks.issuedAt.get(object)).toBe('2026-09-29');
        const [ten] = applyLeverMarks([row('10')], marks);
        expect(ten.recommendations[0].done).toBe(true);
    });

    it('отметка ставится только совету того же менеджера и с тем же ключом', () => {
        const [volume] = toRecommendations(forecastWith([lever()]), { n: 40 });
        const marks = leverFeedbackMarks([
            {
                kind: 'recommendation_done',
                object: leverFeedbackObject('10', volume.key),
            },
            {
                kind: 'recommendation_issued',
                object: leverFeedbackObject('10', volume.key),
                payload: { day: '2026-09-09' },
            },
            {
                kind: 'recommendation_issued',
                object: leverFeedbackObject('10', volume.key),
                payload: { day: '2026-09-03' },
            },
            // Чужой менеджер — не отметка для строки 10.
            {
                kind: 'recommendation_done',
                object: leverFeedbackObject('20', 'quality:x:::'),
            },
            // Не совет и чужая форма объекта — пропускаются.
            { kind: 'recommendation_done', object: 'overview:10' },
            { kind: 'disagree', object: leverFeedbackObject('10', volume.key) },
        ]);

        const [ten, twenty] = applyLeverMarks([row('10'), row('20')], marks);

        expect(ten.recommendations.map(item => item.done)).toEqual([
            true,
            false,
        ]);
        expect(ten.recommendations[0].issuedAt).toBe('2026-09-03');
        expect(ten.recommendations[1].issuedAt).toBeNull();
        expect(twenty.recommendations.map(item => item.done)).toEqual([
            false,
            false,
        ]);
    });

    it('без отметок строки возвращаются как есть; исходные строки не мутируются', () => {
        const rows = [row('10')];
        expect(applyLeverMarks(rows, leverFeedbackMarks([]))).toEqual(rows);

        const [volume] = rows[0].recommendations;
        const marked = applyLeverMarks(
            rows,
            leverFeedbackMarks([
                {
                    kind: 'recommendation_done',
                    object: leverFeedbackObject('10', volume.key),
                },
            ]),
        );
        expect(marked[0].recommendations[0].done).toBe(true);
        expect(rows[0].recommendations[0].done).toBe(false);
    });
});
