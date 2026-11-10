import {
    buildFactsCatchupUserContent,
    FACTS_CATCHUP_PROMPT,
    FACTS_CATCHUP_SCHEMA,
    factsGapsOf,
    mergeCatchupFacts,
    parseFactsCatchupResult,
    type FactsCatchupResult,
} from '../contracts/call-report-facts-catchup.contract';

/**
 * Контракт догона фактов: схема собирается из подсхем v3.1, ответ модели
 * проверяется по форме, пробелы считаются по отсутствию ключей, слияние
 * трогает только недостающие группы и не меняет оценки.
 */
const facts: FactsCatchupResult = {
    outcome: 'callback_dated',
    issues: [{ code: 'telephony', quote: 'вас не слышно', note: null }],
    prices: [],
    upsell: { attempted: false, kind: null, what: null },
    selfIntro: { introduced: true, companyNamed: false, offerQuestion: 'none' },
    nextStepKind: 'callback',
    objectionTopics: ['no_time', null],
};

const META = {
    at: '2026-11-10T06:00:00.000Z',
    model: 'gpt-x',
    provider: 'vibecode',
};

describe('FACTS_CATCHUP_SCHEMA и промпт', () => {
    it('схема требует все группы фактов, вид шага и темы возражений', () => {
        expect([...FACTS_CATCHUP_SCHEMA.required]).toEqual([
            'outcome',
            'issues',
            'prices',
            'upsell',
            'selfIntro',
            'nextStepKind',
            'objectionTopics',
        ]);
        expect(FACTS_CATCHUP_SCHEMA.additionalProperties).toBe(false);
        expect(FACTS_CATCHUP_PROMPT).toContain('outcome — исход разговора');
        expect(FACTS_CATCHUP_PROMPT).toContain('selfIntro');
        expect(FACTS_CATCHUP_PROMPT).not.toContain('weightedScore');
    });
});

describe('parseFactsCatchupResult', () => {
    it('ответ нужной формы проходит, темы не-строки становятся null', () => {
        const parsed = parseFactsCatchupResult({
            ...facts,
            objectionTopics: ['price', 7, null],
        });

        expect(parsed).toEqual({
            ...facts,
            objectionTopics: ['price', null, null],
        });
    });

    it('не объект, пропущенные массивы или не-строка исхода — null', () => {
        expect(parseFactsCatchupResult(null)).toBeNull();
        expect(parseFactsCatchupResult({ ...facts, issues: 'нет' })).toBeNull();
        expect(parseFactsCatchupResult({ ...facts, outcome: 5 })).toBeNull();
        expect(
            parseFactsCatchupResult({ ...facts, selfIntro: null }),
        ).toBeNull();
    });
});

describe('factsGapsOf', () => {
    it('до v3.1 нет обоих ключей — обе группы; v3.1 с null-исходом — без пробелов', () => {
        expect(factsGapsOf({ weightedScore: 70 })).toEqual([
            'movement',
            'form',
        ]);
        expect(
            factsGapsOf({ outcome: null, selfIntro: { introduced: false } }),
        ).toEqual([]);
    });

    it('частичный v3.1 — только недостающая группа; не объект — ничего', () => {
        expect(factsGapsOf({ outcome: 'refused' })).toEqual(['form']);
        expect(factsGapsOf({ selfIntro: {} })).toEqual(['movement']);
        expect(factsGapsOf('x')).toEqual([]);
    });
});

describe('buildFactsCatchupUserContent', () => {
    it('даёт модели шаг и нумерованные возражения имеющегося разбора перед расшифровкой', () => {
        const text = buildFactsCatchupUserContent(
            'М: Здравствуйте',
            'cold',
            {
                nextStep: { set: true, description: 'Перезвонить в среду' },
                objections: [
                    { objection: 'Нет времени', quote: 'сейчас отчёт' },
                    { objection: 'Дорого' },
                ],
            },
            'ПАСПОРТ',
        );

        expect(text).toContain(
            'Следующий шаг по имеющемуся разбору: Перезвонить в среду',
        );
        expect(text).toContain('1. Нет времени — «сейчас отчёт»');
        expect(text).toContain('2. Дорого');
        expect(text.indexOf('Возражения')).toBeLessThan(
            text.indexOf('ПАСПОРТ'),
        );
        expect(text).toContain('М: Здравствуйте');
    });

    it('без шага и возражений так и пишет', () => {
        const text = buildFactsCatchupUserContent('т', null, {});

        expect(text).toContain('Следующего шага в имеющемся разборе нет.');
        expect(text).toContain('Возражений в имеющемся разборе нет.');
    });
});

describe('mergeCatchupFacts', () => {
    const source = {
        weightedScore: 70,
        versions: { prompt: 'focus-v2.4-2026-10-20' },
        nextStep: { set: true, description: 'Перезвонить' },
        objections: [{ objection: 'Нет времени' }, { objection: 'Дорого' }],
    };

    it('обе группы: факты, вид шага и темы дописаны, оценка и версия на месте', () => {
        const merged = mergeCatchupFacts(
            source,
            facts,
            ['movement', 'form'],
            META,
        );

        expect(merged).toMatchObject({
            weightedScore: 70,
            versions: { prompt: 'focus-v2.4-2026-10-20' },
            outcome: 'callback_dated',
            issues: facts.issues,
            prices: [],
            upsell: facts.upsell,
            selfIntro: facts.selfIntro,
            nextStep: {
                set: true,
                description: 'Перезвонить',
                kind: 'callback',
            },
            objections: [
                { objection: 'Нет времени', topic: 'no_time' },
                { objection: 'Дорого', topic: null },
            ],
            factsCatchup: {
                version: 'facts-v1-2026-11-10',
                groups: ['movement', 'form'],
                ...META,
            },
        });
        expect(source).not.toHaveProperty('outcome');
    });

    it('только форма: движение не трогается, вид шага и темы остаются', () => {
        const merged = mergeCatchupFacts(source, facts, ['form'], META);

        expect(merged).not.toHaveProperty('outcome');
        expect(merged.nextStep).toEqual(source.nextStep);
        expect(merged.selfIntro).toEqual(facts.selfIntro);
    });

    it('шаг без set — kind null; уже заданная тема не перезаписывается', () => {
        const merged = mergeCatchupFacts(
            {
                nextStep: { set: false },
                objections: [{ objection: 'Дорого', topic: 'price' }],
            },
            facts,
            ['movement'],
            META,
        );

        expect(merged.nextStep).toEqual({ set: false, kind: null });
        expect(merged.objections).toEqual([
            { objection: 'Дорого', topic: 'price' },
        ]);
    });
});
