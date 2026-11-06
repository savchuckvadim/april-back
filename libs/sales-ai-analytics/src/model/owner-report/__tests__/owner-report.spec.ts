import { buildOwnerReportFacts } from '../owner-report';
import { outcomeOf } from '../owner-report.calls';
import {
    DEFAULT_STYLE,
    OCTOBER,
    call,
    defaultReport,
    legacyCall,
    resetCounter,
} from './owner-report.fixture';

describe('отчёт собственнику: нормализация звонков', () => {
    beforeEach(resetCounter);

    it('исход из разбора focus-v3.1 — как есть; старый разбор — выводится по полям', () => {
        expect(outcomeOf(call({ outcome: 'postponed' }))).toEqual({
            outcome: 'postponed',
            source: 'analysis',
        });
        // Отказ сильнее шага.
        expect(
            outcomeOf(
                legacyCall({
                    style: { ...DEFAULT_STYLE, refusalCategory: 'price' },
                }),
            ).outcome,
        ).toBe('refused');
        // Шаг с датой и видом, двигающим сделку, — продвинут.
        expect(outcomeOf(legacyCall()).outcome).toBe('advanced');
        // Шаг с датой без вида — перезвон с датой; без даты — отложено.
        expect(
            outcomeOf(
                legacyCall({ nextStep: { set: true, date: '2026-10-20' } }),
            ).outcome,
        ).toBe('callback_dated');
        expect(
            outcomeOf(legacyCall({ nextStep: { set: true, date: null } }))
                .outcome,
        ).toBe('postponed');
        // Нет шага, говорили с секретарём — без контакта.
        expect(
            outcomeOf(
                legacyCall({
                    nextStep: { set: false, date: null },
                    style: { ...DEFAULT_STYLE, interlocutorRole: 'secretary' },
                }),
            ),
        ).toEqual({ outcome: 'no_contact', source: 'derived' });
        // Продвижение сделки ≥ 3 — продвинут даже без даты.
        expect(
            outcomeOf(
                legacyCall({
                    nextStep: { set: false, date: null },
                    methodology: {
                        code: null,
                        checkpointsDone: null,
                        checkpointsTotal: null,
                        spiralsFull: null,
                        spiralsMinFull: null,
                        dealProgress: 4,
                        capsApplied: 0,
                    },
                }),
            ).outcome,
        ).toBe('advanced');
    });

    it('покрытие: короткие, без разбора, чужие и вне периода не считаются единицей', () => {
        const facts = buildOwnerReportFacts(
            [
                call(),
                call({ durationSec: 20 }),
                call({ analysisPresent: false }),
                call({ managerId: null }),
                call({ managerId: '99' }),
                call({ day: '2026-11-02' }),
                legacyCall({ day: '2026-10-07' }),
            ],
            OCTOBER,
            { managerIds: ['7'], minDurationByType: { default: 60 } },
        );
        expect(facts.coverage).toMatchObject({
            calls: 5,
            analyzed: 2,
            short: 1,
            noManager: 1,
            noAnalysis: 1,
            outcomeFromAnalysis: 1,
            outcomeDerived: 1,
            factsSince: '2026-10-05',
        });
        expect(facts.unattributedCalls).toBe(1);
        // Рабочие дни октября без звонков: все, кроме 05.10 и 07.10.
        expect(facts.coverage.silentWorkdays).toHaveLength(20);
        expect(facts.coverage.silentWorkdays).not.toContain('2026-10-05');
    });
});

describe('отчёт собственнику: разделы', () => {
    beforeEach(resetCounter);

    const rows = () => [
        // Холодные: 2 продвинуты, 1 без контакта, 1 отложен без даты с темой.
        call({ day: '2026-10-05' }),
        call({ day: '2026-10-06', managerId: '8' }),
        call({ day: '2026-10-06', outcome: 'no_contact', managerId: '8' }),
        call({
            day: '2026-10-12',
            outcome: 'postponed',
            topics: ['no_time', 'send_to_email'],
        }),
        // Дожим: 1 продвинут, 2 отложены (одна с датой), цена прозвучала.
        call({ day: '2026-10-13', callType: 'decision', managerId: '8' }),
        call({
            transcriptionId: 'dup',
            day: '2026-10-14',
            callType: 'refine',
            report: defaultReport({
                outcome: 'postponed',
                issues: [{ code: 'crm_duplicate', quote: 'уже звонили' }],
                prices: [
                    {
                        amount: 25500,
                        periodMonths: 3,
                        product: null,
                        kind: 'list',
                    },
                    {
                        amount: 102000,
                        periodMonths: 12,
                        product: null,
                        kind: 'list',
                    },
                    {
                        amount: 20000,
                        periodMonths: 3,
                        product: null,
                        kind: 'promo',
                    },
                ],
            }),
        }),
        call({
            day: '2026-10-20',
            callType: 'payment',
            outcome: 'callback_dated',
            topics: ['think_over'],
        }),
        // Показ без выявленных потребностей — утечка навыка.
        call({
            day: '2026-10-21',
            callType: 'presentation',
            outcome: 'callback_dated',
            style: { ...DEFAULT_STYLE, needsFound: false },
        }),
    ];

    it('исходы, группы типов и недели', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        expect(facts.outcomes.byOutcome).toEqual({
            advanced: 3,
            callback_dated: 2,
            postponed: 2,
            refused: 0,
            no_contact: 1,
        });
        expect(facts.outcomes.contacted).toBe(7);
        expect(facts.outcomes.postponedWithDate).toEqual({
            successes: 2,
            n: 4,
            pct: 50,
        });
        const cold = facts.byTypeGroup.find(row => row.group === 'cold');
        expect(cold?.advancedOfAll).toEqual({ successes: 2, n: 4, pct: 50 });
        expect(cold?.advancedOfContacted.n).toBe(3);
        expect(facts.byTypeGroup.map(row => row.group)).toEqual([
            'cold',
            'presentation',
            'followup',
        ]);

        // Октябрь 2026: первая неделя с 28.09 — неполная, последняя до 01.11.
        expect(facts.weeks).toHaveLength(5);
        expect(facts.weeks[0]).toMatchObject({
            weekKey: '2026-09-28',
            from: '2026-10-01',
            to: '2026-10-04',
            partial: true,
            calls: 0,
        });
        expect(facts.weeks[1]).toMatchObject({
            weekKey: '2026-10-05',
            calls: 3,
            cold: 3,
            coldAdvanced: { successes: 2, n: 3 },
            silentWorkdays: ['2026-10-07', '2026-10-08', '2026-10-09'],
        });
        expect(facts.weeks[4].partial).toBe(true);
    });

    it('возражения по темам, сбои, цены', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        expect(facts.objections.callsWithObjections).toMatchObject({
            successes: 2,
            n: 7,
        });
        expect(facts.objections.callsWithObjections.pct).toBeCloseTo(28.57, 1);
        expect(facts.objections.byTopic.map(row => row.topic)).toEqual([
            'no_time',
            'send_to_email',
            'think_over',
        ]);
        expect(facts.objections.byTopic[0]).toMatchObject({
            n: 1,
            calls: 1,
            handled: { successes: 1, n: 1 },
            advancedAfter: { successes: 0, n: 1, pct: 0 },
        });
        expect(facts.objections.coldNotAdvancedTop).toEqual([
            { topic: 'no_time', calls: 1 },
            { topic: 'send_to_email', calls: 1 },
        ]);

        expect(facts.issues.callsWithIssues).toEqual({
            successes: 1,
            n: 8,
            pct: 12.5,
        });
        expect(facts.issues.byCode).toEqual([
            { code: 'crm_duplicate', calls: 1, examples: ['dup'] },
        ]);

        expect(facts.prices.n).toBe(3);
        expect(facts.prices.listPerMonth).toEqual({
            min: 8500,
            max: 8500,
            n: 2,
        });
        expect(facts.prices.listPerYear).toEqual({
            min: 102000,
            max: 102000,
            n: 2,
        });
        expect(facts.prices.promoPerMonth?.n).toBe(1);
        expect(facts.prices.promoPerMonth?.min).toBeCloseTo(6666.67, 1);
        expect(facts.prices.promoPerMonth?.max).toBeCloseTo(6666.67, 1);
        expect(facts.prices.byPeriod).toEqual([
            { periodMonths: 3, range: { min: 20000, max: 25500, n: 2 } },
            { periodMonths: 12, range: { min: 102000, max: 102000, n: 1 } },
        ]);
        expect(facts.prices.dealValue).toEqual({
            amount: 102000,
            basis: 'prices',
        });
    });

    it('утечки: три самых больших, деньги по каждому десятому, природа по коду', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER);
        expect(facts.leaks.map(leak => leak.code)).toEqual([
            'followup_no_decision',
            'postponed_no_date',
            'cold_no_contact',
        ]);
        expect(facts.leaks[0]).toMatchObject({
            scale: { successes: 2, n: 3 },
            money: { amount: 102000, basis: 'prices', deals: 1 },
            nature: 'both',
        });
        expect(facts.leaks[2].money).toBeNull();
    });

    it('признаки управления, вердикт и метрики контроля', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER, {
            crm: {
                byManager: {
                    '7': {
                        deals: 1,
                        invoices: 1,
                        presentations: 2,
                        plan: 100,
                        salesAmount: 90,
                    },
                },
                avgCheck: 150000,
            },
        });
        const sign = (code: string) =>
            facts.management.signs.find(item => item.code === code);
        expect(sign('unified_pricing')).toMatchObject({
            verdict: 'yes',
            value: 1,
        });
        expect(sign('people_dependency')?.verdict).toBe('no');
        expect(sign('people_dependency')?.value).toBeCloseTo(66.67, 1);
        expect(sign('upsell')).toMatchObject({ verdict: 'no', n: 7 });
        expect(sign('base_quality')).toMatchObject({
            verdict: 'no',
            value: 12.5,
        });
        expect(sign('plan_fact')).toMatchObject({
            verdict: 'partial',
            value: 0.9,
        });
        expect(facts.management.verdict).toBe('not_managed');
        // Деньги при CRM — по среднему чеку.
        expect(facts.prices.dealValue).toEqual({
            amount: 150000,
            basis: 'crm',
        });

        expect(facts.controlMetrics.map(metric => metric.code)).toEqual([
            'postponed_with_date',
            'followup_to_advanced',
            'cold_to_advanced',
            'crm_issues',
            'top_manager_share',
        ]);
        // Последняя полная неделя октября — 19–25.10: два звонка, оба без продвижения.
        expect(facts.controlMetrics[0].lastWeek).toEqual({
            successes: 2,
            n: 2,
            pct: 100,
        });
    });

    it('сотрудники: доли считаются от своих знаменателей, CRM подшивается', () => {
        const facts = buildOwnerReportFacts(rows(), OCTOBER, {
            crm: {
                byManager: {
                    '8': {
                        deals: 2,
                        invoices: 1,
                        presentations: 3,
                        plan: null,
                        salesAmount: null,
                    },
                },
                avgCheck: null,
            },
        });
        expect(facts.managers.map(row => row.managerId)).toEqual(['7', '8']);
        const second = facts.managers[1];
        expect(second).toMatchObject({
            calls: 3,
            shareOfTeam: { successes: 3, n: 8 },
            coldAdvanced: { successes: 1, n: 2 },
            contactedAdvanced: { successes: 2, n: 2 },
            advancedShareOfTeam: { successes: 2, n: 3 },
            crm: { deals: 2 },
        });
        expect(facts.managers[0].needsFound).toEqual({
            successes: 4,
            n: 5,
            pct: 80,
        });
    });
});
