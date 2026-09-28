import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_BRIEF_COMPARE_REASONS,
    AI_BRIEF_LIMITS,
    trimEvidencePack,
    type AiBriefFact,
} from '@lib/sales-ai-analytics';
import { buildBriefPrevKey } from '../brief/brief-cache-key.util';
import { EvidencePackBuilder } from '../brief/evidence-pack.builder';
import {
    notReadyPrevFacts,
    type BriefPrevFacts,
} from '../brief/evidence-pack.prev';
import {
    buildAgendaKey,
    buildOverviewKey,
    buildPulseKey,
} from '../cache/cache-key.util';
import {
    AI_BRIEF_ATTENTION_LEAKS_TITLE,
    AI_BRIEF_BASIS_TEXTS,
    AI_BRIEF_FACT_CODES,
    AI_BRIEF_SNAPSHOT_LIMIT,
} from '../constants/ai-brief.const';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { FinanceLoader } from '../domain/loaders/finance.loader';
import { KpiLoader } from '../domain/loaders/kpi.loader';
import { buildManagersKey } from '../domain/loaders/loader-cache-key.util';
import { ManagersLoader } from '../domain/loaders/managers.loader';
import { isoWeekKey } from '../domain/loaders/period.util';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import { BriefUseCase } from '../domain/use-cases/brief.use-case';
import {
    BRIEF_DOMAIN,
    BRIEF_FROM,
    BRIEF_MONTH,
    BRIEF_NOW,
    BRIEF_PREV_FROM,
    BRIEF_PREV_MONTH,
    BRIEF_PREV_TO,
    BRIEF_PULSE_DAY,
    BRIEF_TO,
    briefOverview,
    briefOverviewRow,
    forecastRow,
    modelRecord,
    monthRow,
    weekRow,
} from './fixtures/brief.fixture';
import { dependenciesOf } from './fixtures/module-di.util';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const MANAGERS = [10, 20];
const LINK = 'https://april.bitrix24.ru/crm/type/1036/details/128/';
const OVERVIEW_KEY = buildOverviewKey(
    BRIEF_DOMAIN,
    BRIEF_FROM,
    BRIEF_TO,
    '10_20',
    false,
);
const PREV_OVERVIEW_KEY = buildOverviewKey(
    BRIEF_DOMAIN,
    BRIEF_PREV_FROM,
    BRIEF_PREV_TO,
    '10_20',
    false,
);
const PREV_KEY = buildBriefPrevKey(
    BRIEF_DOMAIN,
    BRIEF_PREV_FROM,
    BRIEF_PREV_TO,
    MANAGERS,
);
const PREV_PERIOD = { from: BRIEF_PREV_FROM, to: BRIEF_PREV_TO };
const PULSE_KEY = buildPulseKey(BRIEF_DOMAIN, BRIEF_PULSE_DAY);
const AGENDA_KEY = buildAgendaKey(BRIEF_DOMAIN, isoWeekKey('2026-09-08'));

/** Пульс: неотработанный сигнал менеджера 10 со ссылкой и чужой сигнал 30. */
const pulse = () => ({
    alerts: [
        {
            managerId: '10',
            transcriptionId: '10-r0',
            kind: 'promise',
            handled: false,
            link: LINK,
        },
        {
            managerId: '30',
            transcriptionId: '2',
            kind: 'urgent',
            handled: false,
            link: null,
        },
    ],
    nextStepDateRate: { value: 0.9, n: 40 },
});

/** Обзор текущего окна: два менеджера с риск-звонками и продажами. */
const currentOverview = (comparableFrom = '') =>
    briefOverview(
        [
            briefOverviewRow('10', {
                riskCalls: 2,
                salesCount: 3,
                analyzed: 200,
                nextStep: { current: 0.2, previous: 0.25, n: 50, nPrev: 40 },
                stepShare: { share: 0.2, n: 50 },
                signal: 'risk',
                gap: -0.08,
            }),
            briefOverviewRow('20', {
                riskCalls: 1,
                salesCount: 1,
                analyzed: 100,
                nextStep: { current: 0.1, previous: 0.15, n: 50, nPrev: 60 },
                stepShare: { share: 0.1, n: 50 },
            }),
        ],
        { comparableFrom },
    );

/** Обзор прошлого окна: меньше сигналов, больше продаж, шаг с датой чаще. */
const prevOverview = () =>
    briefOverview([
        briefOverviewRow('10', {
            riskCalls: 1,
            salesCount: 4,
            analyzed: 150,
            stepShare: { share: 0.25, n: 40 },
        }),
        briefOverviewRow('20', {
            riskCalls: 0,
            salesCount: 2,
            analyzed: 100,
            stepShare: { share: 0.15, n: 60 },
        }),
    ]);

interface Harness {
    /** Значения кэша по ключам (промах — ключа нет). */
    cached?: Record<string, unknown>;
    weeks?: ReturnType<typeof weekRow>[];
    months?: ReturnType<typeof monthRow>[];
    forecasts?: ReturnType<typeof forecastRow>[];
    model?: ReturnType<typeof modelRecord> | null;
    /** Ячейки эфирного времени из AppCache (по одной на менеджера). */
    airtime?: ({ airtimeSeconds: number } | null)[];
}

function makeBuilder({
    cached = {},
    weeks = [],
    months = [],
    forecasts = [],
    model = null,
    airtime = [null, null],
}: Harness) {
    const getJson = jest.fn(
        (key: string): Promise<unknown> => Promise.resolve(cached[key] ?? null),
    );
    const findByKeys = jest.fn(
        (_domain: string, type: string): Promise<unknown[]> => {
            if (type === AI_ANALYTICS_SNAPSHOT_TYPE.forecast) {
                return Promise.resolve(forecasts);
            }

            return Promise.resolve(
                type === AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek ? weeks : [],
            );
        },
    );
    const findManagerMonths = jest.fn().mockResolvedValue(months);
    const latestModel = jest.fn().mockResolvedValue(model);
    const getMany = jest.fn().mockResolvedValue(airtime);
    const builder = new EvidencePackBuilder(
        { getJson } as never,
        { findByKeys, findManagerMonths, latestModel } as never,
        settingsLoaderWith({}),
        { getMany } as never,
    );

    return {
        builder,
        getJson,
        findByKeys,
        findManagerMonths,
        latestModel,
        getMany,
    };
}

const build = (harness: Harness, managerIds = MANAGERS) =>
    makeBuilder(harness).builder.build({
        domain: BRIEF_DOMAIN,
        from: BRIEF_FROM,
        to: BRIEF_TO,
        managerIds,
        now: BRIEF_NOW,
    });

const codesOf = (facts: readonly { code: string }[]): string[] =>
    facts.map(fact => fact.code);

const byCodeOf = (facts: readonly AiBriefFact[]) =>
    new Map(facts.map(fact => [fact.code, fact]));

describe('EvidencePackBuilder: пакет фактов резюме', () => {
    it('промах всех кэшей: пакет собирается из снапшотов, сравнения нет', async () => {
        const pack = await build({
            weeks: [weekRow('10'), weekRow('20')],
            months: [monthRow('10'), monthRow('20')],
            forecasts: [forecastRow('10'), forecastRow('20')],
            model: modelRecord({ mode: 'forecast', warnings: ['no-holidays'] }),
        });

        expect(pack.facts.length).toBeGreaterThanOrEqual(3);
        expect(codesOf(pack.facts)).toEqual([
            AI_BRIEF_FACT_CODES.alerts,
            AI_BRIEF_FACT_CODES.attention,
            AI_BRIEF_FACT_CODES.funnelGap,
            AI_BRIEF_FACT_CODES.planVsFactSales,
            AI_BRIEF_FACT_CODES.pipelineFromStage,
            AI_BRIEF_FACT_CODES.forecastP50,
            AI_BRIEF_FACT_CODES.disciplineNextStep,
            AI_BRIEF_FACT_CODES.callsOverThreshold,
            AI_BRIEF_FACT_CODES.dataQuality,
        ]);
        // Числа фактов — из снапшотов: 2 менеджера × 1 флаг, 2 × 2 утечки,
        // продажи 4 + 4 против плана 6 + 6, звонки 30 + 30.
        const byCode = byCodeOf(pack.facts);
        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)?.value).toBe(2);
        // Число недельное, и подпись говорит об этом, а не «за период».
        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)?.text).toBe(
            'Сигналов риска за неделю: 2',
        );
        expect(byCode.get(AI_BRIEF_FACT_CODES.attention)?.value).toBe(4);
        expect(byCode.get(AI_BRIEF_FACT_CODES.attention)?.text).toBe(
            `${AI_BRIEF_ATTENTION_LEAKS_TITLE}: 4`,
        );
        // Без кэша обзора число месячное, и подпись говорит «за месяц».
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)?.text).toBe(
            'Продаж за месяц: 8 из 12',
        );
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)?.plan).toBe(12);
        expect(byCode.get(AI_BRIEF_FACT_CODES.callsOverThreshold)?.value).toBe(
            60,
        );
        // Разрыв к норме из снапшотов: 12/100 − 0,2 = −0,08, норма в факте;
        // фраза — словами и без знака минус.
        const gap = byCode.get(AI_BRIEF_FACT_CODES.funnelGap);
        expect(gap?.value).toBeCloseTo(-0.08, 10);
        expect(gap?.norm).toBe(0.2);
        expect(gap?.basis).toBe(AI_BRIEF_BASIS_TEXTS.norm);
        expect(gap?.text).toBe(
            'Сильнее всего отстаём от нормы на шаге «звонок → презентация»: на 8 %',
        );
        expect(
            byCode.get(AI_BRIEF_FACT_CODES.disciplineNextStep)?.value,
        ).toBeCloseTo(0.5, 10);
        expect(pack.facts.every(fact => fact.comparable === false)).toBe(true);
        expect(pack.compare).toEqual({
            previousPeriod: null,
            reason: AI_BRIEF_COMPARE_REASONS.noData,
        });
    });

    it('снапшоты читаются по ключу месяца конца периода, окно created_at не сканируется', async () => {
        const harness = makeBuilder({
            weeks: [weekRow('10')],
            months: [monthRow('10')],
            forecasts: [forecastRow('10')],
            model: modelRecord({}),
        });
        await harness.builder.build({
            domain: BRIEF_DOMAIN,
            from: BRIEF_FROM,
            to: BRIEF_TO,
            managerIds: MANAGERS,
            now: BRIEF_NOW,
        });

        expect(harness.latestModel).toHaveBeenCalledWith(
            BRIEF_DOMAIN,
            BRIEF_MONTH,
        );
        expect(harness.findManagerMonths).toHaveBeenCalledWith(
            BRIEF_DOMAIN,
            [BRIEF_MONTH],
            { limit: AI_BRIEF_SNAPSHOT_LIMIT, managerIds: ['10', '20'] },
        );
        expect(harness.findByKeys).toHaveBeenCalledWith(
            BRIEF_DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
            {
                periodKeys: [BRIEF_TO],
                latestOnly: true,
                managerIds: ['10', '20'],
            },
        );
        expect(harness.findByKeys).toHaveBeenCalledWith(
            BRIEF_DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            {
                periodKeys: [isoWeekKey(BRIEF_TO)],
                latestOnly: true,
                managerIds: ['10', '20'],
            },
        );
    });

    it('кэш обзора и пульса имеют приоритет над снапшотами: числа периода, фокус и неотработанные сигналы', async () => {
        const harness = makeBuilder({
            cached: {
                [PULSE_KEY]: pulse(),
                [OVERVIEW_KEY]: { status: 'ready', data: currentOverview() },
            },
            weeks: [weekRow('10')],
            months: [monthRow('10')],
        });
        const pack = await harness.builder.build({
            domain: BRIEF_DOMAIN,
            from: BRIEF_FROM,
            to: BRIEF_TO,
            managerIds: MANAGERS,
            now: BRIEF_NOW,
        });
        const byCode = byCodeOf(pack.facts);

        // Сигналы риска — риск-звонки периода по обзору (2 + 1), а не пульс.
        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)?.value).toBe(3);
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)?.value).toBe(4);
        expect(byCode.get(AI_BRIEF_FACT_CODES.callsOverThreshold)?.value).toBe(
            300,
        );
        // «Внимание» считается над строками периметра тем же правилом, что
        // и вкладка: риск-звонки есть у обоих менеджеров.
        expect(byCode.get(AI_BRIEF_FACT_CODES.attention)?.value).toBe(2);
        expect(byCode.get(AI_BRIEF_FACT_CODES.attention)?.n).toBe(2);
        // Дисциплина — доля за весь период по ячейкам обзора. Окна «две
        // недели» внутри периода сравнением с прошлым периодом не считаются:
        // без обзора прошлого окна сравнения нет.
        const discipline = byCode.get(AI_BRIEF_FACT_CODES.disciplineNextStep);
        expect(discipline?.value).toBeCloseTo(0.15, 10);
        expect(discipline?.prev).toBeNull();
        expect(discipline?.comparable).toBe(false);
        expect(discipline?.n).toBe(100);
        expect(pack.facts.every(fact => !fact.comparable)).toBe(true);
        expect(pack.compare.reason).toBe(AI_BRIEF_COMPARE_REASONS.noData);
        // Неотработанные сигналы — только из пульса и только в периметре.
        const unhandled = byCode.get(AI_BRIEF_FACT_CODES.alertsUnhandled);
        expect(unhandled?.value).toBe(1);
        expect(unhandled?.link).toBe(LINK);
        // Фокус — карточки «Внимания» над строками обзора; ссылка карточки —
        // ссылка на разбор риск-звонка из пульса.
        const focus = pack.facts.filter(fact => fact.code.startsWith('focus_'));
        // Три пункта фокуса — три разных человека: по старшей карточке.
        expect(focus.map(fact => fact.managerId)).toEqual(['10', '20']);
        const risk10 = focus.find(
            fact => fact.managerId === '10' && fact.signal === 'risk',
        );
        // Фраза — заголовок карточки как есть, без повторённого названия.
        expect(risk10?.text.startsWith('Сигналы риска: 2')).toBe(true);
        expect(risk10?.text).not.toMatch(/Сигналы риска: Сигналы риска/);
        expect(risk10?.link).toBe(LINK);
        expect(focus.every(fact => fact.comparable === false)).toBe(true);
        // Пульс попал в кэш — недельные снапшоты не читались вовсе.
        expect(
            harness.findByKeys.mock.calls.map(call => call[1]),
        ).not.toContain(AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek);
    });

    it('обзор прошлого окна даёт prev, изменение и статус сравнения пакета', async () => {
        const pack = await build({
            cached: {
                [OVERVIEW_KEY]: { status: 'ready', data: currentOverview() },
                [PREV_OVERVIEW_KEY]: { status: 'ready', data: prevOverview() },
            },
        });
        const byCode = byCodeOf(pack.facts);
        const alerts = byCode.get(AI_BRIEF_FACT_CODES.alerts);

        expect(alerts).toEqual(
            expect.objectContaining({
                value: 3,
                prev: 1,
                delta: 2,
                deltaPct: 200,
                comparable: true,
                basis: AI_BRIEF_BASIS_TEXTS.period,
                text: 'Сигналов риска за период: 3 (было 1)',
            }),
        );
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)).toEqual(
            expect.objectContaining({ value: 4, prev: 6, delta: -2 }),
        );
        expect(byCode.get(AI_BRIEF_FACT_CODES.callsOverThreshold)).toEqual(
            expect.objectContaining({ value: 300, prev: 250, delta: 50 }),
        );
        expect(byCode.get(AI_BRIEF_FACT_CODES.attention)).toEqual(
            expect.objectContaining({ value: 2, prev: 1, comparable: true }),
        );
        // Шаг с датой — доля за период против доли за прошлый период,
        // обе посчитаны по ячейкам своих обзоров: (0,2·50 + 0,1·50) / 100
        // против (0,25·40 + 0,15·60) / 100.
        const discipline = byCode.get(AI_BRIEF_FACT_CODES.disciplineNextStep);
        expect(discipline?.value).toBeCloseTo(0.15, 10);
        expect(discipline?.prev).toBeCloseTo(0.19, 10);
        expect(discipline?.delta).toBeCloseTo(-0.04, 10);
        expect(discipline?.comparable).toBe(true);
        expect(discipline?.basis).toBe(AI_BRIEF_BASIS_TEXTS.period);
        expect(pack.compare).toEqual({
            previousPeriod: { from: BRIEF_PREV_FROM, to: BRIEF_PREV_TO },
            reason: null,
        });
    });

    it('за прошлый период звонки не разбирались — сигналы и шаг с датой не сравниваются, продажи сравниваются', async () => {
        const pack = await build({
            cached: {
                [OVERVIEW_KEY]: { status: 'ready', data: currentOverview() },
                [PREV_OVERVIEW_KEY]: {
                    status: 'ready',
                    data: briefOverview([
                        briefOverviewRow('10', { salesCount: 4, analyzed: 0 }),
                        briefOverviewRow('20', { salesCount: 2, analyzed: 0 }),
                    ]),
                },
            },
        });
        const byCode = byCodeOf(pack.facts);

        for (const code of [
            AI_BRIEF_FACT_CODES.alerts,
            AI_BRIEF_FACT_CODES.attention,
            AI_BRIEF_FACT_CODES.disciplineNextStep,
        ]) {
            expect(byCode.get(code)?.comparable).toBe(false);
            expect(byCode.get(code)?.prev).toBeNull();
        }
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)).toEqual(
            expect.objectContaining({ value: 4, prev: 6, comparable: true }),
        );
        expect(pack.compare.reason).toBeNull();
    });

    it('обзор по всему ростеру портала годится периметру: строки чужих менеджеров отсекаются', async () => {
        const rosterOverview = (rows: ReturnType<typeof briefOverviewRow>[]) =>
            briefOverview([
                ...rows,
                briefOverviewRow('30', {
                    riskCalls: 9,
                    salesCount: 9,
                    analyzed: 90,
                }),
            ]);
        const harness = makeBuilder({
            cached: {
                [buildManagersKey(BRIEF_DOMAIN)]: [10, 20, 30],
                [buildOverviewKey(
                    BRIEF_DOMAIN,
                    BRIEF_FROM,
                    BRIEF_TO,
                    '10_20_30',
                    false,
                )]: {
                    status: 'ready',
                    data: rosterOverview(currentOverview().managers),
                },
                [buildOverviewKey(
                    BRIEF_DOMAIN,
                    BRIEF_PREV_FROM,
                    BRIEF_PREV_TO,
                    '10_20_30',
                    false,
                )]: {
                    status: 'ready',
                    data: rosterOverview(prevOverview().managers),
                },
            },
        });
        const pack = await harness.builder.build({
            domain: BRIEF_DOMAIN,
            from: BRIEF_FROM,
            to: BRIEF_TO,
            managerIds: MANAGERS,
            now: BRIEF_NOW,
        });
        const byCode = byCodeOf(pack.facts);

        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)).toEqual(
            expect.objectContaining({ value: 3, prev: 1, comparable: true }),
        );
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)).toEqual(
            expect.objectContaining({ value: 4, prev: 6 }),
        );
        expect(
            pack.facts
                .filter(fact => fact.code.startsWith('focus_'))
                .map(fact => fact.managerId),
        ).toEqual(['10', '20']);
    });

    it('обзор по ростеру без менеджера периметра не используется', async () => {
        const pack = await build({
            cached: {
                [buildManagersKey(BRIEF_DOMAIN)]: [10, 30],
                [buildOverviewKey(
                    BRIEF_DOMAIN,
                    BRIEF_FROM,
                    BRIEF_TO,
                    '10_30',
                    false,
                )]: {
                    status: 'ready',
                    data: briefOverview([
                        briefOverviewRow('10', { riskCalls: 2 }),
                        briefOverviewRow('30', { riskCalls: 5 }),
                    ]),
                },
            },
            months: [monthRow('10'), monthRow('20')],
        });
        const byCode = byCodeOf(pack.facts);

        // Менеджера 20 в обзоре нет — числа берутся из снапшотов.
        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)).toBeUndefined();
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)?.text).toBe(
            'Продаж за месяц: 8 из 12',
        );
    });

    it('кэш brief:prev имеет приоритет над обзором прошлого окна', async () => {
        const prevFacts: BriefPrevFacts = {
            from: BRIEF_PREV_FROM,
            to: BRIEF_PREV_TO,
            alerts: 6,
            sales: 5,
            analyzedCalls: 350,
            attention: 2,
            nextStep: 0.3,
        };
        const pack = await build({
            cached: {
                [OVERVIEW_KEY]: { status: 'ready', data: currentOverview() },
                [PREV_OVERVIEW_KEY]: { status: 'ready', data: prevOverview() },
                [PREV_KEY]: prevFacts,
            },
        });
        const byCode = byCodeOf(pack.facts);

        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)?.prev).toBe(6);
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)?.prev).toBe(5);
        expect(byCode.get(AI_BRIEF_FACT_CODES.callsOverThreshold)?.prev).toBe(
            350,
        );
        expect(
            byCode.get(AI_BRIEF_FACT_CODES.disciplineNextStep)?.prev,
        ).toBeCloseTo(0.3, 10);
    });

    it('пометка «не готов» в brief:prev даёт причину prev-not-ready без сравнений', async () => {
        const pack = await build({
            cached: {
                [OVERVIEW_KEY]: { status: 'ready', data: currentOverview() },
                [PREV_KEY]: notReadyPrevFacts(PREV_PERIOD),
            },
        });

        expect(pack.compare.reason).toBe(AI_BRIEF_COMPARE_REASONS.prevNotReady);
        expect(pack.facts.every(fact => !fact.comparable)).toBe(true);
    });

    it('готовый обзор прошлого окна сильнее пометки «не готов»', async () => {
        const pack = await build({
            cached: {
                [OVERVIEW_KEY]: { status: 'ready', data: currentOverview() },
                [PREV_OVERVIEW_KEY]: { status: 'ready', data: prevOverview() },
                [PREV_KEY]: notReadyPrevFacts(PREV_PERIOD),
            },
        });

        expect(pack.compare.reason).toBeNull();
        expect(byCodeOf(pack.facts).get(AI_BRIEF_FACT_CODES.alerts)?.prev).toBe(
            1,
        );
    });

    it('прошлый период посчитан, а обзора самого периода нет — сравнений нет, статус «расчёт не готов»', async () => {
        const pack = await build({
            cached: {
                [PULSE_KEY]: pulse(),
                [PREV_OVERVIEW_KEY]: { status: 'ready', data: prevOverview() },
            },
            months: [monthRow('10'), monthRow('20')],
        });
        const byCode = byCodeOf(pack.facts);

        // Числа запасных источников — за другое окно, с прошлым периодом
        // они не сравниваются, и подписи называют своё окно.
        expect(pack.facts.every(fact => !fact.comparable)).toBe(true);
        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)?.text).toBe(
            'Сигналов риска за последние рабочие дни: 1',
        );
        expect(pack.compare).toEqual({
            previousPeriod: null,
            reason: AI_BRIEF_COMPARE_REASONS.prevNotReady,
        });
    });

    it('прошлый период раньше сравнимой истории — сравнений нет вовсе', async () => {
        const pack = await build({
            cached: {
                [OVERVIEW_KEY]: {
                    status: 'ready',
                    data: currentOverview('2026-09-01'),
                },
                [PREV_OVERVIEW_KEY]: { status: 'ready', data: prevOverview() },
            },
        });

        expect(pack.compare).toEqual({
            previousPeriod: null,
            reason: AI_BRIEF_COMPARE_REASONS.beforeComparable,
        });
        for (const fact of pack.facts) {
            expect(fact.comparable).toBe(false);
            expect(fact.prev ?? null).toBeNull();
        }
    });

    it('повестка планёрки читается из кэша недели: число звонков в периметре и ссылка', async () => {
        const pack = await build({
            cached: {
                [AGENDA_KEY]: {
                    weekKey: isoWeekKey('2026-09-08'),
                    items: [
                        { transcriptionId: '1', managerId: '10', link: null },
                        { transcriptionId: '2', managerId: null, link: null },
                        { transcriptionId: '3', managerId: '30', link: null },
                        { transcriptionId: '4', managerId: '20', link: LINK },
                    ],
                    disagreements: [],
                },
            },
        });
        const agenda = byCodeOf(pack.facts).get(AI_BRIEF_FACT_CODES.agenda);

        // Чужой звонок и звонок без менеджера периметру не считаются.
        expect(agenda?.value).toBe(2);
        expect(agenda?.link).toBe(LINK);
    });

    it('снапшоты без кэша: числа «за месяц» с прошлым периодом не сравниваются', async () => {
        const pack = await build({
            months: [
                monthRow('10'),
                monthRow('20'),
                // Чужой месяц в выдаче стора в сумму не попадает.
                monthRow('10', {
                    monthKey: BRIEF_PREV_MONTH,
                    salesCount: 3,
                    calls: 20,
                }),
            ],
        });
        const byCode = byCodeOf(pack.facts);
        const sales = byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales);
        const calls = byCode.get(AI_BRIEF_FACT_CODES.callsOverThreshold);

        expect(sales).toEqual(
            expect.objectContaining({
                value: 8,
                prev: null,
                delta: null,
                comparable: false,
                text: 'Продаж за месяц: 8 из 12',
            }),
        );
        expect(calls).toEqual(
            expect.objectContaining({
                value: 60,
                prev: null,
                title: 'Разобрано звонков за месяц',
                comparable: false,
            }),
        );
        expect(pack.compare.reason).toBe(AI_BRIEF_COMPARE_REASONS.noData);
    });

    it('разрыв к норме: шум, интенсивность и опережение нормы фактом не становятся', async () => {
        const gapOf = async (row: ReturnType<typeof briefOverviewRow>) =>
            byCodeOf(
                (
                    await build({
                        cached: {
                            [OVERVIEW_KEY]: {
                                status: 'ready',
                                data: briefOverview([
                                    row,
                                    briefOverviewRow('20'),
                                ]),
                            },
                        },
                    })
                ).facts,
            ).get(AI_BRIEF_FACT_CODES.funnelGap);

        expect(
            await gapOf(
                briefOverviewRow('10', { gap: -0.2, gapDirection: 'none' }),
            ),
        ).toBeUndefined();
        expect(
            await gapOf(
                briefOverviewRow('10', { gap: -0.2, estimand: 'rate' }),
            ),
        ).toBeUndefined();
        expect(
            await gapOf(briefOverviewRow('10', { gap: 0.1 })),
        ).toBeUndefined();
        expect(
            await gapOf(
                briefOverviewRow('10', { gap: -0.2, gapDirection: 'below' }),
            ),
        ).toEqual(
            expect.objectContaining({
                value: -0.2,
                managerId: '10',
                text: 'Сильнее всего отстаём от нормы на шаге «звонок → презентация»: на 20 %',
            }),
        );
    });

    it('без явного ростера кэш обзора и эфирного времени не читаются', async () => {
        const harness = makeBuilder({ months: [monthRow('10')] });
        await harness.builder.build({
            domain: BRIEF_DOMAIN,
            from: BRIEF_FROM,
            to: BRIEF_TO,
            managerIds: [],
            now: BRIEF_NOW,
        });

        expect(harness.getMany).not.toHaveBeenCalled();
        const keys = harness.getJson.mock.calls.map(call => call[0]);
        expect(keys).toContain(PULSE_KEY);
        expect(keys).toContain(buildManagersKey(BRIEF_DOMAIN));
        expect(keys.some(key => key.includes(':overview:'))).toBe(false);
    });

    it('без явного ростера кэшированный ростер портала открывает кэш обзора обоих окон', async () => {
        const harness = makeBuilder({
            cached: {
                [buildManagersKey(BRIEF_DOMAIN)]: [20, 10],
                [OVERVIEW_KEY]: { status: 'ready', data: currentOverview() },
                [PREV_OVERVIEW_KEY]: { status: 'ready', data: prevOverview() },
            },
            airtime: [{ airtimeSeconds: 60 }, { airtimeSeconds: 30 }],
        });
        const pack = await harness.builder.build({
            domain: BRIEF_DOMAIN,
            from: BRIEF_FROM,
            to: BRIEF_TO,
            managerIds: [],
            now: BRIEF_NOW,
        });
        const byCode = byCodeOf(pack.facts);

        expect(harness.getJson).toHaveBeenCalledWith(OVERVIEW_KEY);
        expect(harness.getJson).toHaveBeenCalledWith(PREV_OVERVIEW_KEY);
        expect(harness.getMany).toHaveBeenCalled();
        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)?.prev).toBe(1);
        expect(byCode.get(AI_BRIEF_FACT_CODES.airtime)?.value).toBe(90);
        // Ключ brief:prev — по входному (пустому) ростеру, не по кэшированному.
        expect(harness.getJson).toHaveBeenCalledWith(
            buildBriefPrevKey(BRIEF_DOMAIN, BRIEF_PREV_FROM, BRIEF_PREV_TO, []),
        );
    });

    it('эфирное время берётся из кэша модуля airtime по ячейкам месяца', async () => {
        const pack = await build({
            months: [monthRow('10')],
            airtime: [{ airtimeSeconds: 3600 }, { airtimeSeconds: 1800 }],
        });
        const airtime = pack.facts.find(
            fact => fact.code === AI_BRIEF_FACT_CODES.airtime,
        );

        expect(airtime?.value).toBe(5400);
        expect(airtime?.n).toBe(2);
        // Фраза — часами и минутами словами, без сокращений единиц.
        expect(airtime?.text).toBe(
            'Эфирное время отдела за месяц: 1 час 30 минут',
        );
    });

    it('forecast_p50 попадает в пакет только при готовности не ниже forecast', async () => {
        const below = await build({
            forecasts: [forecastRow('10')],
            model: modelRecord({ mode: 'norms' }),
        });
        const ready = await build({
            forecasts: [forecastRow('10')],
            model: modelRecord({ mode: 'forecast' }),
        });

        expect(codesOf(below.facts)).not.toContain(
            AI_BRIEF_FACT_CODES.forecastP50,
        );
        expect(codesOf(ready.facts)).toContain(AI_BRIEF_FACT_CODES.forecastP50);
    });

    it('при полном промахе источников факт пропускается, пакет может быть пуст', async () => {
        const pack = await build({});

        expect(pack.facts).toEqual([]);
        expect(pack.droppedCodes).toEqual([]);
    });

    it('обрезка идёт по приоритету видов и лимитам пакета', async () => {
        const pack = await build({
            weeks: [weekRow('10')],
            months: [monthRow('10')],
            forecasts: [forecastRow('10')],
            model: modelRecord({ mode: 'forecast', warnings: ['no-holidays'] }),
            airtime: [{ airtimeSeconds: 60 }],
        });
        expect(pack.facts.length).toBeLessThanOrEqual(
            AI_BRIEF_LIMITS.packFacts,
        );

        const trimmed = trimEvidencePack(pack.facts, { maxFacts: 3 });
        expect(codesOf(trimmed.facts)).toEqual([
            AI_BRIEF_FACT_CODES.alerts,
            AI_BRIEF_FACT_CODES.attention,
            AI_BRIEF_FACT_CODES.funnelGap,
        ]);
        expect(trimmed.droppedCodes).toContain(AI_BRIEF_FACT_CODES.dataQuality);

        const byBytes = trimEvidencePack(pack.facts, { maxBytes: 900 });
        expect(byBytes.facts.length).toBeLessThan(pack.facts.length);
        expect(codesOf(byBytes.facts)[0]).toBe(AI_BRIEF_FACT_CODES.alerts);
    });

    it('мок-гард: ни сборщик, ни use-case’ы резюме не зависят от Bitrix и транскрипций', () => {
        const heavy = [
            CallsLoader,
            KpiLoader,
            FinanceLoader,
            ManagersLoader,
        ].map(unit => unit.name);
        for (const unit of [
            EvidencePackBuilder,
            BriefUseCase,
            BriefJobUseCase,
        ]) {
            const names = dependenciesOf(unit).map(dep => dep.name);
            expect(names.filter(name => heavy.includes(name))).toEqual([]);
            expect(names).not.toContain('PBXService');
            expect(names).not.toContain('AiAnalyticsTranscriptionStore');
        }
    });
});
