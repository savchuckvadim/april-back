import { CORE_CAPS } from '../core-caps.const';
import {
    applyCaps,
    buildMethodologyFacts,
    evaluateCheckpoints,
    evaluateMethodology,
} from '../methodology-evaluate';
import type {
    MethodologyAnalysisView,
    MethodologyPassRaw,
    SpiralResult,
} from '../methodology-result.types';
import { POLYANSKY_METHODOLOGY } from '../polyansky.methodology';

const spiral = (over: Partial<SpiralResult> = {}): SpiralResult => ({
    need: 'нужна практика по 44-ФЗ',
    feature: 'судебная практика',
    link: 'ищет по вашим закупкам',
    benefit: 'спор готовите за час',
    question: 'подходит?',
    clientAnswer: 'да',
    full: true,
    ...over,
});

const presentation = (
    over: Partial<MethodologyAnalysisView> = {},
): MethodologyAnalysisView => ({
    callType: 'presentation',
    sections: [
        { section: 'GREETING', relevance: 40, score: 8 },
        { section: 'NEEDS', relevance: 70, score: 7 },
        { section: 'PRESENTATION', relevance: 100, score: 9 },
        { section: 'CLOSING', relevance: 90, score: 8 },
        { section: 'PRICE', relevance: 0 },
    ],
    score: 8,
    needsFound: true,
    needs: ['практика', 'формы'],
    presentationDone: true,
    priceDiscussed: true,
    productive: true,
    nextStep: {
        set: true,
        date: '2026-11-05',
        time: '11:00',
        goal: 'узнать решение',
        clientAction: 'показать директору',
        managerAction: 'прислать счёт',
    },
    talkRatioPct: 55,
    questionsCount: 9,
    interlocutorRole: 'lpr',
    specialist: 'lawyer',
    hvostSteps: {
        desire: true,
        offered: true,
        priceReaction: true,
        decisionProcess: true,
        decisionWay: true,
    },
    dealProgress: {
        score: 3,
        before: 'сомневался',
        after: 'готов показать директору',
        why: 'барьер назван',
        whyNotHigher: 'решение за директором',
    },
    ...over,
});

const pass = (over: Partial<MethodologyPassRaw> = {}): MethodologyPassRaw => ({
    checkpoints: [
        {
            code: 'pres.needs_confirmed',
            status: 'done',
            quote: 'Итак, вам важно…',
            startSec: 120,
            endSec: 130,
        },
        {
            code: 'pres.summary_by_needs',
            status: 'missed',
            quote: null,
            startSec: null,
            endSec: null,
        },
        {
            code: 'pres.kit_12m',
            status: 'not_applicable',
            quote: null,
            startSec: null,
            endSec: null,
        },
    ],
    spirals: [spiral(), spiral(), spiral({ question: null, full: false })],
    ...over,
});

const NORMS = { talkRatioPct: 60 };

/**
 * Вычисление методики кодом: факты из разбора (в том числе полнота шага и
 * спирали), пункты модели и правил, ограничители ядра и методики со срезом
 * оценок, итог со счётчиками; без методики — только ограничители ядра.
 */
describe('buildMethodologyFacts', () => {
    it('собирает факты, полноту шага и счётчики спиралей; неизвестное не кладёт', () => {
        const facts = buildMethodologyFacts(presentation(), pass().spirals);
        expect(facts).toMatchObject({
            needsFound: true,
            needsCount: 2,
            presentationDone: true,
            nextStepSet: true,
            nextStepDate: '2026-11-05',
            nextStepTime: '11:00',
            nextStepComplete: true,
            talkRatioPct: 55,
            hvostDecisionWay: true,
            spiralsFull: 2,
            spiralsWithoutNeed: 0,
            spiralsWithoutQuestion: 1,
            dealProgressScore: 3,
        });
        const bare = buildMethodologyFacts(
            { callType: 'cold', sections: [] },
            null,
        );
        expect(bare).toEqual({});
    });

    it('шаг без времени или цели — не полный; пустые строки — null', () => {
        const facts = buildMethodologyFacts(
            presentation({
                nextStep: {
                    set: true,
                    date: '2026-11-05',
                    time: '',
                    goal: null,
                },
                interlocutorRole: '  ',
            }),
            null,
        );
        expect(facts.nextStepComplete).toBe(false);
        expect(facts.nextStepTime).toBeNull();
        expect(facts.interlocutorRole).toBeNull();
    });
});

describe('evaluateCheckpoints', () => {
    it('модельные пункты — по ответу, отсутствующие — не применимы; правила — по фактам и спиралям', () => {
        const view = presentation();
        const facts = buildMethodologyFacts(view, pass().spirals);
        const results = evaluateCheckpoints(
            POLYANSKY_METHODOLOGY,
            'presentation',
            pass(),
            facts,
            NORMS,
        );
        const byCode = Object.fromEntries(results.map(r => [r.code, r]));
        expect(byCode['pres.needs_confirmed']).toMatchObject({
            status: 'done',
            source: 'model',
            quote: 'Итак, вам важно…',
            startSec: 120,
        });
        expect(byCode['pres.summary_by_needs'].status).toBe('missed');
        expect(byCode['pres.kit_12m'].status).toBe('not_applicable');
        // Модель про пункт промолчала — не штрафуем.
        expect(byCode['pres.desire'].status).toBe('not_applicable');
        // Правила кода: две полные спирали из трёх — минимум не выполнен,
        // один виток без вопроса — обратная связь пропущена, монолога нет.
        expect(byCode['pres.spirals_min']).toMatchObject({
            status: 'missed',
            source: 'rule',
        });
        expect(byCode['pres.feedback_per_block'].status).toBe('missed');
        expect(byCode['pres.block_no_need'].status).toBe('done');
        expect(byCode['pres.dialogue'].status).toBe('done');
    });

    it('правило без нужных фактов или нормы — пункт не применим', () => {
        const facts = buildMethodologyFacts(
            presentation({ talkRatioPct: undefined }),
            null,
        );
        const results = evaluateCheckpoints(
            POLYANSKY_METHODOLOGY,
            'presentation',
            null,
            facts,
            {},
        );
        const byCode = Object.fromEntries(results.map(r => [r.code, r.status]));
        expect(byCode['pres.spirals_min']).toBe('not_applicable');
        expect(byCode['pres.dialogue']).toBe('not_applicable');
    });
});

describe('applyCaps', () => {
    it('срезает оценку раздела и итог до потолка, пишет до/после; условие без среза — applied false', () => {
        const view = presentation({
            needsFound: false,
            score: 8,
            sections: [
                { section: 'PRESENTATION', relevance: 100, score: 9 },
                { section: 'CLOSING', relevance: 90, score: 5 },
            ],
            nextStep: { set: true, date: null },
        });
        const facts = buildMethodologyFacts(view, null);
        const { sections, score, triggered } = applyCaps(view, CORE_CAPS, {
            facts,
            norms: NORMS,
        });
        expect(sections.find(s => s.section === 'PRESENTATION')?.score).toBe(6);
        expect(score).toBe(8);
        expect(triggered).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'core.presentation_without_needs',
                    before: 9,
                    after: 6,
                    applied: true,
                }),
                // Финал без даты: закрытие уже 5 — ниже потолка, среза нет.
                expect.objectContaining({
                    code: 'core.info_promise_without_date',
                    before: 5,
                    after: 5,
                    applied: false,
                }),
            ]),
        );
    });

    it('потолок итога и ограничители по типу звонка', () => {
        const cold: MethodologyAnalysisView = {
            callType: 'cold',
            sections: [{ section: 'CLOSING', relevance: 80, score: 7 }],
            score: 8,
            needsFound: false,
            nextStep: { set: true, date: null },
            interlocutorRole: null,
        };
        const facts = buildMethodologyFacts(cold, null);
        const { score, triggered } = applyCaps(
            cold,
            POLYANSKY_METHODOLOGY.caps,
            {
                facts,
                norms: {},
            },
        );
        // Диагностики нет (итог ≤ 7), собеседник не уточнён (≤ 7), даты показа нет (≤ 6).
        expect(score).toBe(6);
        expect(triggered.map(t => t.code)).toEqual(
            expect.arrayContaining([
                'cold.no_diagnostics',
                'cold.contact_unknown',
                'cold.no_presentation_slot',
            ]),
        );
        expect(triggered.map(t => t.code)).not.toContain(
            'rep.no_close_attempt',
        );
    });
});

describe('evaluateMethodology', () => {
    it('с методикой: пункты, спирали, ограничители ядра и методики, счётчики обязательных', () => {
        const view = presentation({
            sections: [
                { section: 'PRESENTATION', relevance: 100, score: 9 },
                { section: 'CLOSING', relevance: 90, score: 8 },
            ],
        });
        const result = evaluateMethodology({
            view,
            methodology: POLYANSKY_METHODOLOGY,
            pass: pass(),
            coreCaps: CORE_CAPS,
            norms: NORMS,
        });
        expect(result.methodology).toMatchObject({
            code: 'polyansky',
            version: '1.0.0',
            spiralsFull: 2,
        });
        expect(result.methodology?.spirals).toHaveLength(3);
        const total = result.methodology?.checkpointsTotal ?? 0;
        expect(result.methodology?.checkpointsDone).toBeLessThanOrEqual(total);
        expect(total).toBeGreaterThan(0);
        // Обратная связь после блоков пропущена → потолок презентации 7.
        expect(
            result.sections.find(s => s.section === 'PRESENTATION')?.score,
        ).toBe(7);
        expect(result.capsTriggered.map(c => c.code)).toContain(
            'pres.no_questions_after_blocks',
        );
    });

    it('без методики: только ограничители ядра, итог методики null, спирали не считаются', () => {
        const view = presentation({ needsFound: false });
        const result = evaluateMethodology({
            view,
            methodology: null,
            pass: pass(),
            coreCaps: CORE_CAPS,
            norms: NORMS,
        });
        expect(result.methodology).toBeNull();
        expect(
            result.sections.find(s => s.section === 'PRESENTATION')?.score,
        ).toBe(6);
        expect(result.capsTriggered.map(c => c.code)).toEqual([
            'core.presentation_without_needs',
        ]);
    });

    it('методика не покрывает тип звонка — как без методики', () => {
        const result = evaluateMethodology({
            view: presentation({ callType: 'event_invite' }),
            methodology: POLYANSKY_METHODOLOGY,
            pass: pass(),
            coreCaps: CORE_CAPS,
            norms: NORMS,
        });
        expect(result.methodology).toBeNull();
    });
});
