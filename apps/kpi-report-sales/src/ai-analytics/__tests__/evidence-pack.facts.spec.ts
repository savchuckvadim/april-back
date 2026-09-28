import {
    AI_BRIEF_COMPARE_REASONS,
    AI_BRIEF_DATA_QUALITY_SIGNALS,
    AI_READINESS_REASON_CODES,
    type AiBriefFact,
} from '@lib/sales-ai-analytics';
import { compareStatus, trimWithCompare } from '../brief/evidence-pack.builder';
import {
    alertsFact,
    disciplineFact,
    planVsFactSalesFact,
} from '../brief/evidence-pack.facts';
import {
    dataQualityFact,
    funnelGapFact,
} from '../brief/evidence-pack.facts.extra';
import {
    agendaFact,
    alertsUnhandledFact,
    focusFact,
} from '../brief/evidence-pack.focus';
import {
    countSignals,
    nextStepShare,
    sumRiskCalls,
} from '../brief/evidence-pack.overview';
import {
    extractPrevFacts,
    hasPrevNumbers,
    isPrevFacts,
    notReadyPrevFacts,
} from '../brief/evidence-pack.prev';
import type { BriefPackSources } from '../brief/evidence-pack.types';
import { AI_SANITY_RULES } from '../steps/sanity.types';
import type { AiAgendaDto } from '../dto/ai-agenda.dto';
import type { AiPulseDto } from '../dto/ai-pulse.dto';
import {
    BRIEF_PREV_FROM,
    BRIEF_PREV_TO,
    briefOverview,
    briefOverviewRow,
    modelRecord,
} from './fixtures/brief.fixture';

const LINK = 'https://april.bitrix24.ru/crm/type/1036/details/128/';
const PREV = { from: BRIEF_PREV_FROM, to: BRIEF_PREV_TO };

/** Источники пакета без единого попадания; переопределяй нужные. */
function sourcesWith(
    overrides: Partial<BriefPackSources> = {},
): BriefPackSources {
    return {
        pulse: null,
        overview: null,
        prevFacts: null,
        agenda: null,
        airtime: null,
        weeks: [],
        months: [],
        forecasts: [],
        model: null,
        comparableFrom: '',
        previousPeriod: PREV,
        beforeComparable: false,
        ...overrides,
    };
}

const rows = () => [
    briefOverviewRow('10', {
        riskCalls: 2,
        salesCount: 3,
        analyzed: 200,
        nextStep: { current: 0.2, previous: 0.25, n: 50, nPrev: 40 },
        stepShare: { share: 0.2, n: 50 },
        signal: 'risk',
    }),
    briefOverviewRow('20', {
        riskCalls: 0,
        salesCount: 1,
        analyzed: 100,
        nextStep: { current: 0.1, previous: null, n: 50, nPrev: 0 },
        stepShare: { share: 0.1, n: 150 },
    }),
    briefOverviewRow('30', {
        riskCalls: 5,
        salesCount: 9,
        analyzed: 50,
        // Звонков мало — доли у ячейки нет, в среднее она не входит.
        stepShare: { share: null, n: 3 },
    }),
];

describe('агрегаты по строкам обзора', () => {
    it('риск-звонки суммируются, доля «шаг с датой» за период взвешивается объёмом ячеек', () => {
        const scoped = rows().slice(0, 2);

        expect(sumRiskCalls(scoped)).toBe(2);
        // (0,2·50 + 0,1·150) / 200 = 0,125 — доля, а не проценты.
        const share = nextStepShare(scoped);
        expect(share?.value).toBeCloseTo(0.125, 10);
        expect(share?.n).toBe(200);
        expect(nextStepShare(rows())?.n).toBe(200);
        expect(nextStepShare([briefOverviewRow('40')])).toBeNull();
    });

    it('«Внимание» считается над строками периметра правилом вкладки, а не полем строки', () => {
        // Поле signal проставлено только у менеджера 10, но карточку дают
        // риск-звонки: у 10 и 30 они есть, у 20 — нет.
        expect(countSignals(rows())).toBe(2);
        expect(countSignals(rows().slice(0, 2))).toBe(1);
        expect(countSignals([])).toBe(0);
    });

    it('факты прошлого периода — в периметре, форма проверяется guard’ом', () => {
        const prev = extractPrevFacts(briefOverview(rows()), PREV, [
            '10',
            '20',
        ]);

        expect(prev).toEqual({
            from: BRIEF_PREV_FROM,
            to: BRIEF_PREV_TO,
            alerts: 2,
            sales: 4,
            analyzedCalls: 300,
            attention: 1,
            nextStep: expect.closeTo(0.125, 10) as number,
        });
        expect(isPrevFacts(prev)).toBe(true);
        expect(hasPrevNumbers(prev)).toBe(true);
        expect(isPrevFacts({ from: '2026-08-25' })).toBe(false);
        expect(isPrevFacts(null)).toBe(false);
        // Запись прежней формы (без доли «шаг с датой») не принимается.
        expect(
            isPrevFacts({
                ...PREV,
                alerts: 1,
                sales: 1,
                analyzedCalls: 1,
                attention: 1,
            }),
        ).toBe(false);
        expect(hasPrevNumbers(notReadyPrevFacts(PREV))).toBe(false);
        expect(isPrevFacts(notReadyPrevFacts(PREV))).toBe(true);
        expect(hasPrevNumbers(null)).toBe(false);
    });

    it('за прошлый период звонки не разбирались — числа по разборам не отдаются', () => {
        const prev = extractPrevFacts(
            briefOverview([
                briefOverviewRow('10', { salesCount: 4, analyzed: 0 }),
            ]),
            PREV,
            [],
        );

        expect(prev).toEqual({
            ...PREV,
            alerts: null,
            sales: 4,
            analyzedCalls: 0,
            attention: null,
            nextStep: null,
        });
    });
});

describe('факты с прошлым периодом', () => {
    it('периметр режет строки обзора; prev снимается, если прошлый период несопоставим', () => {
        const overview = briefOverview(rows());
        const prevFacts = {
            ...PREV,
            alerts: 1,
            sales: 2,
            analyzedCalls: 100,
            attention: 0,
            nextStep: 0.2,
        };
        const alerts = alertsFact(sourcesWith({ overview, prevFacts }), [
            '10',
            '20',
        ]);
        expect(alerts).toEqual(
            expect.objectContaining({
                value: 2,
                prev: 1,
                delta: 1,
                comparable: true,
            }),
        );

        const gated = alertsFact(
            sourcesWith({ overview, prevFacts, beforeComparable: true }),
            ['10', '20'],
        );
        expect(gated).toEqual(
            expect.objectContaining({
                value: 2,
                prev: null,
                comparable: false,
            }),
        );
        expect(planVsFactSalesFact(sourcesWith({ overview }), [])).toEqual(
            expect.objectContaining({ value: 13, comparable: false }),
        );
    });

    it('за период звонки не разбирались — ноль сигналов с прошлым периодом не сравнивается', () => {
        const overview = briefOverview([
            briefOverviewRow('10', { salesCount: 2, analyzed: 0 }),
        ]);
        const prevFacts = {
            ...PREV,
            alerts: 5,
            sales: 1,
            analyzedCalls: 80,
            attention: 1,
            nextStep: 0.2,
        };
        const sources = sourcesWith({ overview, prevFacts });

        expect(alertsFact(sources, [])).toEqual(
            expect.objectContaining({
                value: 0,
                prev: null,
                comparable: false,
            }),
        );
        // Продажи от разборов не зависят — сравнение остаётся.
        expect(planVsFactSalesFact(sources, [])).toEqual(
            expect.objectContaining({ value: 2, prev: 1, comparable: true }),
        );
    });

    it('дисциплина: доля за период против доли за прошлый период', () => {
        const overview = briefOverview(rows());
        const prevFacts = {
            ...PREV,
            alerts: 1,
            sales: 2,
            analyzedCalls: 100,
            attention: 0,
            nextStep: 0.2,
        };
        const fact = disciplineFact(sourcesWith({ overview, prevFacts }), [
            '10',
            '20',
        ]);

        expect(fact?.value).toBeCloseTo(0.125, 10);
        expect(fact?.prev).toBe(0.2);
        expect(fact?.delta).toBeCloseTo(-0.075, 10);
        expect(fact?.comparable).toBe(true);
        expect(fact?.text).toBe(
            'Доля звонков с назначенным шагом и датой: 12,5 % (было 20 %)',
        );
        // Окна «две недели» строки сравнением не считаются: без прошлого
        // периода сравнения нет, хотя второе окно у строки заполнено.
        expect(disciplineFact(sourcesWith({ overview }), ['10', '20'])).toEqual(
            expect.objectContaining({ prev: null, comparable: false }),
        );
    });

    it('дисциплина: обзор без долей → пульс → ничего', () => {
        const overview = briefOverview([briefOverviewRow('10')]);
        const pulse = {
            alerts: [],
            nextStepDateRate: { value: 0.9, n: 40 },
        } as unknown as AiPulseDto;

        expect(disciplineFact(sourcesWith({ overview, pulse }), [])).toEqual(
            expect.objectContaining({ value: 0.9, n: 40, comparable: false }),
        );
        expect(disciplineFact(sourcesWith({ overview }), [])).toBeNull();
    });
});

describe('фокус, неотработанные сигналы и повестка', () => {
    const pulse = {
        alerts: [
            {
                managerId: '10',
                transcriptionId: '10-r1',
                kind: 'promise',
                handled: false,
                link: LINK,
            },
            {
                managerId: '10',
                transcriptionId: '10-r0',
                kind: 'promise',
                handled: true,
                link: null,
            },
            {
                managerId: '20',
                transcriptionId: '20-r0',
                kind: 'urgent',
                handled: false,
                link: null,
            },
        ],
        nextStepDateRate: { value: 0.5, n: 10 },
    } as unknown as AiPulseDto;

    it('факт фокуса: заголовок карточки как есть, менеджер, ссылка на разбор из пульса', () => {
        const sources = sourcesWith({ overview: briefOverview(rows()), pulse });
        const first = focusFact(sources, ['10', '20'], 0);

        expect(first).toEqual(
            expect.objectContaining({
                code: 'focus_1',
                managerId: '10',
                signal: 'risk',
                link: LINK,
                comparable: false,
            }),
        );
        // Название сигнала не дублируется и не подменяется жаргоном.
        expect(first?.text.startsWith('Сигналы риска: 2 (')).toBe(true);
        // Менеджер 30 вне периметра — карточки нет; четвёртого факта не бывает.
        expect(focusFact(sources, ['10', '20'], 1)).toBeNull();
        expect(focusFact(sources, ['10', '20'], 3)).toBeNull();
        expect(focusFact(sourcesWith({ pulse }), [], 0)).toBeNull();
    });

    it('фокус — по одному пункту на менеджера, даже если карточек у него несколько', () => {
        const overview = briefOverview([
            // Две карточки: риск-звонки и «разобрано мало» (2 из 40).
            {
                ...briefOverviewRow('10', { riskCalls: 2, analyzed: 2 }),
                callsTotal: 40,
            },
            briefOverviewRow('20', { riskCalls: 1, analyzed: 100 }),
        ]);
        const sources = sourcesWith({ overview, pulse });
        const focus = [0, 1, 2].map(index => focusFact(sources, [], index));

        expect(focus.map(fact => fact?.managerId ?? null)).toEqual([
            '10',
            '20',
            null,
        ]);
    });

    it('неотработанные сигналы считаются по пульсу в периметре, ссылка — первого со ссылкой', () => {
        const fact = alertsUnhandledFact(sourcesWith({ pulse }), ['10', '20']);

        expect(fact).toEqual(
            expect.objectContaining({ value: 2, n: 2, link: LINK }),
        );
        expect(alertsUnhandledFact(sourcesWith({ pulse }), ['20'])).toEqual(
            expect.objectContaining({ value: 1, link: null }),
        );
        expect(alertsUnhandledFact(sourcesWith({}), [])).toBeNull();
    });

    it('повестка: чужие звонки и звонки без менеджера периметру не считаются', () => {
        const agenda = {
            weekKey: '2026-W37',
            items: [
                { transcriptionId: '1', managerId: '10', link: null },
                { transcriptionId: '2', managerId: null, link: LINK },
                { transcriptionId: '3', managerId: '30', link: LINK },
            ],
            disagreements: [],
        } as unknown as AiAgendaDto;

        // Звонок без менеджера мог быть чужим — периметру он не виден,
        // и ссылка на него в резюме не попадает.
        expect(agendaFact(sourcesWith({ agenda }), ['10', '20'])).toEqual(
            expect.objectContaining({ value: 1, link: null }),
        );
        // Тот, кто видит весь портал, видит и звонки без менеджера.
        expect(agendaFact(sourcesWith({ agenda }), [])).toEqual(
            expect.objectContaining({ value: 3, link: LINK }),
        );
        expect(agendaFact(sourcesWith({}), [])).toBeNull();
    });
});

describe('норма, качество данных и статус сравнения', () => {
    it('разрыв к норме несёт норму уровня и менеджера худшего шага', () => {
        const overview = briefOverview([
            briefOverviewRow('10', { gap: -0.03, levelNorm: 0.2 }),
            briefOverviewRow('20', { gap: -0.09, levelNorm: 0.25 }),
        ]);
        const fact = funnelGapFact(sourcesWith({ overview }), []);

        expect(fact).toEqual(
            expect.objectContaining({
                value: -0.09,
                norm: 0.25,
                managerId: '20',
                comparable: false,
            }),
        );
        expect(fact?.title).toContain('«звонок → презентация»');
        expect(fact?.text).toBe(
            'Сильнее всего отстаём от нормы на шаге «звонок → презентация»: на 9 %',
        );
    });

    it('замечания о рабочем календаре — не про даты в сделках', () => {
        const calendar = dataQualityFact(
            sourcesWith({
                model: modelRecord({
                    reasons: [AI_READINESS_REASON_CODES.calendarMissing],
                    warnings: ['на год праздников нет'],
                    warningRules: [AI_SANITY_RULES.calendar],
                }).payload as never,
            }),
        );

        expect(calendar).toEqual(
            expect.objectContaining({
                value: 2,
                signal: AI_BRIEF_DATA_QUALITY_SIGNALS.other,
            }),
        );
    });

    it('замечания про даты помечаются сигналом dates, остальные — other', () => {
        const dates = dataQualityFact(
            sourcesWith({
                model: modelRecord({
                    reasons: [],
                    warnings: ['утечка'],
                    warningRules: [AI_SANITY_RULES.timestampLeak],
                }).payload as never,
            }),
        );
        const other = dataQualityFact(
            sourcesWith({ model: modelRecord({}).payload as never }),
        );

        expect(dates).toEqual(
            expect.objectContaining({
                value: 1,
                signal: AI_BRIEF_DATA_QUALITY_SIGNALS.dates,
            }),
        );
        expect(other).toEqual(
            expect.objectContaining({
                value: 1,
                signal: AI_BRIEF_DATA_QUALITY_SIGNALS.other,
            }),
        );
    });

    it('статус сравнения следует за фактами: несопоставим → есть → не готов → нет данных', () => {
        const prevFacts = {
            ...notReadyPrevFacts(PREV),
            alerts: 1,
        };
        const overview = briefOverview(rows());
        const compared = [alertsFact(sourcesWith({ overview, prevFacts }), [])];
        const plain = [alertsFact(sourcesWith({ overview }), [])];
        const factsOf = (items: (AiBriefFact | null)[]): AiBriefFact[] =>
            items.filter((item): item is AiBriefFact => item !== null);

        expect(
            compareStatus(
                sourcesWith({ prevFacts, beforeComparable: true }),
                factsOf(compared),
            ),
        ).toEqual({
            previousPeriod: null,
            reason: AI_BRIEF_COMPARE_REASONS.beforeComparable,
        });
        expect(
            compareStatus(sourcesWith({ prevFacts }), factsOf(compared)),
        ).toEqual({ previousPeriod: PREV, reason: null });
        // Числа прошлого периода есть, но ни один факт с ними не сравнён
        // (обзора самого периода нет) — сравнения у пакета нет.
        expect(
            compareStatus(sourcesWith({ prevFacts }), factsOf(plain)),
        ).toEqual({
            previousPeriod: null,
            reason: AI_BRIEF_COMPARE_REASONS.prevNotReady,
        });
        expect(
            compareStatus(
                sourcesWith({ prevFacts: notReadyPrevFacts(PREV) }),
                factsOf(plain),
            ).reason,
        ).toBe(AI_BRIEF_COMPARE_REASONS.prevNotReady);
        expect(compareStatus(sourcesWith({}), factsOf(plain)).reason).toBe(
            AI_BRIEF_COMPARE_REASONS.noData,
        );
    });

    it('обрезка выбросила все сравнённые факты — пакет сравнения не обещает', () => {
        const prevFacts = { ...notReadyPrevFacts(PREV), sales: 5 };
        const sources = sourcesWith({
            overview: briefOverview(rows()),
            pulse: {
                alerts: [],
                nextStepDateRate: { value: 0.5, n: 10 },
            } as unknown as AiPulseDto,
            prevFacts,
        });
        const facts = [
            alertsUnhandledFact(sources, []),
            planVsFactSalesFact(sources, []),
        ].filter((item): item is AiBriefFact => item !== null);

        expect(facts.map(item => item.comparable)).toEqual([false, true]);
        expect(trimWithCompare(sources, facts).compare.reason).toBeNull();
        // Остался один факт — несравнённый сигнал риска (вид alert старше).
        const trimmed = trimWithCompare(sources, facts, { maxFacts: 1 });
        expect(trimmed.facts.map(item => item.code)).toEqual([
            'alerts_unhandled',
        ]);
        expect(trimmed.compare).toEqual({
            previousPeriod: null,
            reason: AI_BRIEF_COMPARE_REASONS.prevNotReady,
        });
    });
});
