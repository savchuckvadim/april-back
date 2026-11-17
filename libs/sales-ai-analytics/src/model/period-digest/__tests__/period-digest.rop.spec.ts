import { DIGEST_RECOMMENDATION_CODE as CODE } from '../period-digest.codes';
import { compareDigestMetrics } from '../period-digest.compare';
import {
    digestRopDiscuss,
    digestRopListen,
    DigestRopInput,
} from '../period-digest.rop';
import {
    evaluateDigestRecommendation,
    newDigestRecommendation,
} from '../period-digest.status';
import type { DigestSectionStat } from '../period-digest.types';
import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    sectionAsWas,
} from './digest-context.fixture';
import {
    evaluateMonths,
    issueRecommendation,
} from './digest-recommendation.fixture';

const below = (
    section: string,
    mean: number,
    n: number,
): DigestSectionStat => ({
    section,
    mean,
    n,
    standing: { position: 'below', scope: 'department', middle: 6 },
});

const base = digestContextOf([]).metrics;
const metrics = {
    ...base,
    score: { value: 5.6, n: 12 },
    sections: [
        below('CLOSING', 5.1, 8),
        below('NEEDS', 4.4, 6),
        { section: 'PRICE', mean: 7, n: 6, standing: null },
    ],
};
const previous = compareDigestMetrics(
    metrics,
    { ...base, score: { value: 6.4, n: 12 } },
    '2026-09',
    { minN: 5 },
);

/** «Выявление потребностей» без цели три оценки подряд. */
const escalated = evaluateMonths(issueRecommendation(), [4.2, 4.4, 4.5]);

/** Возражения без ответа: было 40 %, стало 55 %. */
const worse = evaluateDigestRecommendation(
    newDigestRecommendation({
        code: CODE.followupObjections,
        text: 'Отвечать на каждое возражение на доработке',
        source: 'template',
        anchor: { metric: 'objection_unhandled_share' },
        periodKey: '2026-09',
        baseline: { value: 0.4, n: 20 },
        target: 0.2,
        evidence: { transcriptionIds: [], quote: null },
    }),
    { value: 0.55, n: 20 },
    '2026-10',
    { minN: 5 },
);

const input = (patch: Partial<DigestRopInput> = {}): DigestRopInput => ({
    recommendations: [],
    metrics,
    previous,
    rows: [],
    rules: { weakSectionScoreMax: 5, lowScoreCallMax: 4 },
    ...patch,
});

describe('блок «Для РОПа»', () => {
    it('обсудить: эскалированные → стало хуже → раздел ниже середины, не больше трёх', () => {
        const discuss = digestRopDiscuss(
            input({ recommendations: [worse, escalated] }),
        );

        expect(discuss).toEqual([
            'Цель не достигнута за три оценки: «Выявление потребностей» на ' +
                'звонках «Презентация» — 4,5 из 10 при цели 5,0.',
            'Стало хуже: доля возражений без ответа на доработке — 40 % → 55 %.',
            // «Выявление потребностей» уже названо — строкой «ниже середины» не повторяется.
            '«Закрытие разговора» — ниже середины отдела: 5,1 из 10 по 8 звонкам.',
        ]);
        discuss.forEach(text => expect(text).not.toMatch(LATIN_OR_CODE));
    });

    it('без рекомендаций: разделы ниже середины худшими первыми, затем падение средней', () => {
        expect(digestRopDiscuss(input())).toEqual([
            '«Выявление потребностей» — ниже середины отдела: 4,4 из 10 по 6 звонкам.',
            '«Закрытие разговора» — ниже середины отдела: 5,1 из 10 по 8 звонкам.',
            'Средняя оценка звонков снизилась: 6,4 → 5,6 из 10.',
        ]);
        expect(
            digestRopDiscuss(input({ metrics: base, previous: null })),
        ).toEqual([]);
    });

    it('послушать: повестка по звонкам менеджера, не больше трёх, ссылок нет', () => {
        const rows = digestCalls('p', 'presentation', 5, index => ({
            sections: [sectionAsWas('NEEDS', 3, `Фраза ${index + 1}`)],
        }));

        const listen = digestRopListen(input({ rows }));

        expect(listen).toHaveLength(3);
        listen.forEach(item =>
            expect(item).toMatchObject({
                callType: 'presentation',
                score: 7,
                link: null,
            }),
        );
        expect(listen.map(item => item.transcriptionId)).toEqual(
            expect.arrayContaining([expect.stringMatching(/^p\d$/)]),
        );
    });
});
