import { DEFAULT_WORK_CALENDAR } from '../../workdays.util';
import {
    buildPeriodDigestCards,
    DigestBatchInput,
} from '../period-digest.batch';
import { buildManagerDigestCard } from '../period-digest.card';
import { DIGEST_RECOMMENDATION_CODE as CODE } from '../period-digest.codes';
import { newDigestRecommendation } from '../period-digest.status';
import { DIGEST_DEFAULT_SHIFT } from '../period-digest.thresholds';
import type { DigestPeriod, ManagerDigestCard } from '../period-digest.types';
import {
    DIGEST_PERIODS,
    MIN_DURATION,
    THRESHOLDS,
    digestCalls,
} from './digest-context.fixture';

const SEPTEMBER: DigestPeriod = {
    kind: 'month',
    key: '2026-09',
    from: '2026-09-01',
    to: '2026-09-30',
};

/** Шесть звонков менеджера в октябре, первые `dated` — шаг с датой. */
const calls = (managerId: string, dated: number) =>
    digestCalls(`m${managerId}-`, 'call', 6, index => ({
        managerId,
        nextStep: {
            set: true,
            date: index < dated ? '2026-10-20' : null,
        },
    }));

const MANAGERS = [
    { id: '1', name: 'Иванова Анна', departmentId: 7, departmentName: 'ОП 1' },
    { id: '2', name: 'Петров Сергей', departmentId: 7, departmentName: 'ОП 1' },
    {
        id: '3',
        name: 'Сидоров Кирилл',
        departmentId: 7,
        departmentName: 'ОП 1',
    },
    {
        id: '4',
        name: 'Кузнецова Елена',
        departmentId: 8,
        departmentName: 'ОП 2',
    },
];

const nextStepRecommendation = (periodKey: string) =>
    newDigestRecommendation({
        code: CODE.nextStepDated,
        text: 'Договариваться о дате следующего контакта',
        source: 'template',
        anchor: { metric: 'next_step_dated_share' },
        periodKey,
        baseline: { value: 0.5, n: 6 },
        target: 0.7,
        evidence: { transcriptionIds: [], quote: null },
    });

const input = (patch: Partial<DigestBatchInput> = {}): DigestBatchInput => ({
    periods: {
        current: DIGEST_PERIODS.month,
        previous: SEPTEMBER,
        yearAgo: { ...DIGEST_PERIODS.month, key: '2025-10' },
    },
    managers: MANAGERS,
    rows: {
        current: [...calls('1', 1), ...calls('2', 5), ...calls('3', 6)],
        previous: [],
        yearAgo: [],
    },
    previousCards: new Map(),
    monthCards: null,
    settings: {
        thresholds: THRESHOLDS,
        minDurationByType: MIN_DURATION,
        minCalls: 5,
        shift: DIGEST_DEFAULT_SHIFT,
    },
    calendar: DEFAULT_WORK_CALENDAR,
    ...patch,
});

describe('карточки выпуска по всем менеджерам', () => {
    it('сравнение с отделом идёт до сборки карточек: «ниже середины» даёт рекомендацию', () => {
        const [first, second, , silent] = buildPeriodDigestCards(input());

        // Шаг с датой: 17 % у '1' при середине отдела 83 %.
        expect(first.standings.nextStepDated).toMatchObject({
            position: 'below',
            scope: 'department',
        });
        expect(first.recommendations.map(item => item.code)).toEqual([
            CODE.nextStepDated,
        ]);
        expect(first.recommendations[0].text).toContain('ниже середины отдела');
        expect(second.standings.nextStepDated?.position).toBe('middle');
        expect(second.recommendations).toEqual([]);
        // Без звонков — карточка «нет звонков», сравнивать не с чем.
        expect(silent).toMatchObject({
            managerId: '4',
            readiness: 'no_calls',
            standings: { score: null, nextStepDated: null },
            recommendations: [],
        });
    });

    it('без прохода по отделу та же карточка рекомендацию бы не дала', () => {
        const [withPeers] = buildPeriodDigestCards(input());
        const alone = buildManagerDigestCard({
            period: DIGEST_PERIODS.month,
            manager: MANAGERS[0],
            rows: calls('1', 1),
            metrics: withPeers.metrics,
            peers: null,
            settings: input().settings,
            previous: null,
            yearAgo: null,
        });

        expect(alone.recommendations).toEqual([]);
    });

    it('рекомендации прошлой карточки переносятся и оцениваются', () => {
        const [, base] = buildPeriodDigestCards(input());
        const previousCard: ManagerDigestCard = {
            ...base,
            period: SEPTEMBER,
            recommendations: [nextStepRecommendation('2026-09')],
        };

        const [, second] = buildPeriodDigestCards(
            input({ previousCards: new Map([['2', previousCard]]) }),
        );

        expect(second.previous?.periodKey).toBe('2026-09');
        expect(second.recommendations).toHaveLength(1);
        expect(second.recommendations[0]).toMatchObject({
            code: CODE.nextStepDated,
            evaluations: 1,
            status: 'improved',
        });
    });

    it('неделя: шаги к целям месяца по карточкам месяца, год назад не считается', () => {
        const [monthBase] = buildPeriodDigestCards(input());
        const monthCard: ManagerDigestCard = {
            ...monthBase,
            recommendations: [nextStepRecommendation('2026-09')],
        };

        const [weekCard] = buildPeriodDigestCards(
            input({
                periods: {
                    current: DIGEST_PERIODS.week,
                    previous: {
                        kind: 'week',
                        key: '2026-W40',
                        from: '2026-09-28',
                        to: '2026-10-04',
                    },
                    yearAgo: null,
                },
                monthCards: new Map([['1', monthCard]]),
            }),
        );

        expect(weekCard.period.kind).toBe('week');
        expect(weekCard.weeklySteps?.map(step => step.code)).toEqual([
            CODE.nextStepDated,
        ]);
        expect(weekCard.yearAgo).toBeNull();
        // Код месяца в работе — своя недельная по нему не выдаётся.
        expect(weekCard.recommendations.map(item => item.code)).not.toContain(
            CODE.nextStepDated,
        );
    });
});
