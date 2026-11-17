import { DIGEST_RECOMMENDATION_CODE as CODE } from '../period-digest.codes';
import { newDigestRecommendation } from '../period-digest.status';
import { DIGEST_DEFAULT_SHIFT } from '../period-digest.thresholds';
import type { DigestRecommendation } from '../period-digest.types';
import {
    activeMonthRecommendations,
    digestWeeklySteps,
    weekExcludedCodes,
} from '../period-digest.weekly-steps';
import {
    LATIN_OR_CODE,
    digestCalls,
    sectionAsWas,
} from './digest-context.fixture';

/** Месячная рекомендация октября: «Выявление потребностей» 4,2 → цель 5,2. */
const needs: DigestRecommendation = newDigestRecommendation({
    code: CODE.presentationNeeds,
    text: 'Выяснять задачи клиента до показа',
    source: 'template',
    anchor: {
        metric: 'section_mean',
        section: 'NEEDS',
        callTypes: ['presentation'],
    },
    periodKey: '2026-10',
    baseline: { value: 4.2, n: 7 },
    target: 5.2,
    evidence: { transcriptionIds: [], quote: null },
});

const closed: DigestRecommendation = {
    ...needs,
    code: CODE.lowScoreCalls,
    lifecycle: 'fixed',
};

const week = (scores: readonly number[]) => ({
    rows: digestCalls('p', 'presentation', scores.length, index => ({
        sections: [sectionAsWas('NEEDS', scores[index])],
    })),
    minN: 3,
    shift: DIGEST_DEFAULT_SHIFT,
    lowScoreCallMax: 4,
});

describe('шаги недели к целям месяца', () => {
    it('только активные месячные; месячной карточки нет — шагов нет', () => {
        expect(
            activeMonthRecommendations([needs, closed]).map(item => item.code),
        ).toEqual([CODE.presentationNeeds]);
        expect([...weekExcludedCodes([needs, closed])]).toEqual([
            CODE.presentationNeeds,
        ]);
        expect(digestWeeklySteps(null, week([5, 5, 6]))).toEqual([]);
        expect(weekExcludedCodes(null).size).toBe(0);
    });

    it('цель месяца уже взята за неделю — идёт к цели', () => {
        const [step] = digestWeeklySteps([needs, closed], week([5, 5, 6]));

        expect(step).toEqual({
            code: CODE.presentationNeeds,
            weekValue: { value: 5.3, n: 3 },
            target: 5.2,
            state: 'on_track',
            text:
                'Выяснять задачи клиента до показа: за неделю 5,3 из 10 при ' +
                'цели 5,2 — идёт к цели.',
        });
        expect(step.text).not.toMatch(LATIN_OR_CODE);
    });

    it('сдвиг к цели на порог — идёт к цели; без сдвига — отстаёт', () => {
        expect(digestWeeklySteps([needs], week([5, 5, 4]))[0].state).toBe(
            'on_track',
        );
        const [behind] = digestWeeklySteps([needs], week([4, 4, 5]));
        expect(behind.state).toBe('behind');
        expect(behind.text).toBe(
            'Выяснять задачи клиента до показа: за неделю 4,3 из 10 при ' +
                'цели 5,2 — отстаёт.',
        );
    });

    it('за неделю меньше трёх звонков — мало данных', () => {
        const [step] = digestWeeklySteps([needs], week([7, 7]));

        expect(step.state).toBe('no_data');
        expect(step.text).toBe(
            'Выяснять задачи клиента до показа: за неделю мало данных.',
        );
    });
});
