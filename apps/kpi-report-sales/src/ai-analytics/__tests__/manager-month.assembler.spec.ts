import 'reflect-metadata';
import type { AiScoringSettings } from '@lib/sales-ai-analytics';
import { buildManagerMonthPayload } from '../domain/assembler/manager-month.assembler';
import type { ManagerMonthInput } from '../domain/assembler/manager-month.assembler';
import type { ManagerPassportFacts } from '../domain/assembler/manager-snapshot.types';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { liteRow, portalSettings } from './fixtures/lite-row.fixture';
import {
    financeMonth,
    financeResult,
    kpiManagerMonth,
    kpiMonth,
    pipelineRow,
} from './fixtures/manager-snapshot.fixture';

const META = {
    calcVersion: 'sam-1.0.0',
    paramsVersion: 'pv-1',
    comparableFrom: null,
    generatedAt: '2026-10-03T01:00:00.000Z',
    modelSnapshotId: 'model-42',
};

const PASSPORT: ManagerPassportFacts = {
    managerId: '10',
    since: '2026-06-01',
    sinceSource: 'employment',
    status: 'active',
    leftAt: null,
    level: null,
    levelSource: null,
    tenureMonths: 3,
    tenureBand: '0-6',
};

/** По звонку в каждый день сентября: месяц без «мёртвых» серий. */
function monthRows(): DatedLiteRow[] {
    return Array.from({ length: 30 }, (_, index) => {
        const day = String(index + 1).padStart(2, '0');
        return liteRow({
            transcriptionId: `t-${day}`,
            callStartedAt: new Date(`2026-09-${day}T09:00:00Z`),
        }) as DatedLiteRow;
    });
}

function input(overrides: Partial<ManagerMonthInput> = {}): ManagerMonthInput {
    return {
        monthKey: '2026-09',
        day: '2026-10-03',
        managerIds: ['10'],
        calendar: portalSettings().calendar,
        timeZone: 'Europe/Moscow',
        rows: monthRows(),
        kpi: kpiMonth('2026-09', [
            kpiManagerMonth(10, {
                callDone: 100,
                presentationUniqDone: 20,
                offers: 12,
                invoices: 8,
                success: 3,
            }),
        ]),
        finance: financeResult(
            [financeMonth('2026-09', 10, { salesCount: 3, monthlyAmount: 90 })],
            [pipelineRow(10, { count: 7, hot: 4, withOffer: 2 })],
        ),
        settings: portalSettings(),
        registry: {},
        passports: new Map([['10', PASSPORT]]),
        plans: new Map([['10', { sales: 5, calls: 400, presentations: 30 }]]),
        styles: new Map(),
        chainSharePct: 0,
        comparableFrom: null,
        meta: META,
        ...overrides,
    };
}

describe('buildManagerMonthPayload — месяц менеджера', () => {
    it('нагрузка несёт экспозицию, рёбра, паспорт, план и версии модели', () => {
        const assembly = buildManagerMonthPayload(input());

        expect(assembly.rows).toHaveLength(1);
        const payload = assembly.rows[0].payload;
        expect(payload.exposure.dCalendar).toBeGreaterThan(0);
        expect(payload.exposure.dMt).toBe(payload.exposure.dCalendar);
        expect(payload.exposure.dActive).toBe(30);
        expect(payload.exposure.daysSource).toBe('calendar');
        expect(payload.exposure.excludedFromNorms).toBe(false);
        expect(payload.passport).toEqual(PASSPORT);
        expect(payload.planSnapshot).toEqual({
            sales: 5,
            calls: 400,
            presentations: 30,
        });
        expect(payload.meta.modelSnapshotId).toBe('model-42');
        expect(payload.kpi.call_done).toBe(100);
        expect(payload.kpi.presentation_uniq_done).toBe(20);
        expect(payload.workdays.absences).toBe(0);
    });

    it('месяц заморожен с 3-го числа следующего месяца', () => {
        expect(buildManagerMonthPayload(input()).frozen).toBe(true);
        expect(
            buildManagerMonthPayload(input({ day: '2026-10-02' })).frozen,
        ).toBe(false);
        expect(
            buildManagerMonthPayload(input({ day: '2026-09-30' })).rows[0]
                .payload.frozen,
        ).toBe(false);
    });

    it('финансы: закрытые продажи, средний чек и живой пайплайн текущего месяца', () => {
        const current = buildManagerMonthPayload(
            input({ monthKey: '2026-09', day: '2026-09-30' }),
        ).rows[0].payload.finance;

        expect(current.salesCount).toBe(3);
        expect(current.salesSum).toBe(90);
        expect(current.averageCheck).toBe(30);
        expect(current.invoicesCount).toBe(8);
        expect(current.invoicesSumKnown).toBe(false);
        expect(current.pipeline).toEqual({
            count: 7,
            monthlyAmount: 0,
            hot: 4,
            withOffer: 2,
        });
    });

    it('у закрытого месяца живого пайплайна нет', () => {
        const payload = buildManagerMonthPayload(input()).rows[0].payload;

        expect(payload.finance.pipeline).toBeNull();
    });
});

describe('Рёбра воронки месяца', () => {
    it('без истории стадий рёбра остаются интенсивностями', () => {
        const edges = buildManagerMonthPayload(input()).rows[0].payload.edges;

        expect(edges.map(edge => edge.edge)).toEqual([
            'call_to_presentation',
            'presentation_to_offer',
            'offer_to_invoice',
            'invoice_to_sale',
        ]);
        expect(edges.every(edge => edge.estimand === 'rate')).toBe(true);
        expect(edges.every(edge => !edge.mixedSources)).toBe(true);
        expect(edges[0]).toMatchObject({ n: 100, s: 20 });
    });

    it('доля сцепки выше порога — вероятности, s > n даёт mixedSources', () => {
        const assembly = buildManagerMonthPayload(
            input({
                chainSharePct: 85,
                kpi: kpiMonth('2026-09', [
                    kpiManagerMonth(10, {
                        callDone: 100,
                        presentationUniqDone: 4,
                        offers: 9,
                    }),
                ]),
            }),
        );

        expect(assembly.estimand.estimand).toBe('prob');
        const edges = assembly.rows[0].payload.edges;
        expect(edges[1]).toMatchObject({
            edge: 'presentation_to_offer',
            n: 4,
            s: 9,
            estimand: 'prob',
            mixedSources: true,
        });
        expect(edges[0].mixedSources).toBe(false);
    });
});

describe('Экспозиция и уровень', () => {
    it('месяц без звонков: прокси-отсутствия и исключение из норм', () => {
        const payload = buildManagerMonthPayload(input({ rows: [] })).rows[0]
            .payload;

        expect(payload.exposure.dActive).toBe(0);
        expect(payload.exposure.daysSource).toBe('proxy');
        expect(payload.exposure.excludedFromNorms).toBe(true);
        expect(payload.exposure.excludeReason).toBe('proxy');
    });

    it('решение руководителя исключает менеджера из норм', () => {
        const payload = buildManagerMonthPayload(
            input({
                settings: portalSettings({
                    managerParams: { '10': { excludeFromNorms: true } },
                }),
            }),
        ).rows[0].payload;

        expect(payload.exposure.excludedFromNorms).toBe(true);
        expect(payload.exposure.excludeReason).toBe('manager-params');
    });

    it('отсутствия менеджера вычитаются из рабочих дней', () => {
        const payload = buildManagerMonthPayload(
            input({
                settings: portalSettings({
                    absences: {
                        '10': [
                            {
                                from: '2026-09-07',
                                to: '2026-09-11',
                                kind: 'vacation',
                            },
                        ],
                    },
                }),
            }),
        ).rows[0].payload;

        expect(payload.exposure.daysSource).toBe('absences');
        expect(payload.workdays.absences).toBe(5);
        expect(payload.exposure.dMt).toBe(payload.exposure.dCalendar - 5);
    });

    it('уровень из настроек — manual, иначе дефолт по стажу паспорта', () => {
        const manual = buildManagerMonthPayload(
            input({
                settings: portalSettings({
                    levels: [
                        {
                            managerId: 10,
                            level: 'senior',
                            since: '2024-01-01',
                            source: 'manual',
                        },
                    ],
                }),
            }),
        ).rows[0].payload;
        expect(manual.level).toBe('senior');
        expect(manual.levelSource).toBe('manual');

        const byTenure = buildManagerMonthPayload(input()).rows[0].payload;
        expect(byTenure.level).toBe('junior');
        expect(byTenure.levelSource).toBe('default');
    });

    it('уровень паспорта используется, когда настройки молчат', () => {
        const payload = buildManagerMonthPayload(
            input({
                passports: new Map([['10', { ...PASSPORT, level: 'middle' }]]),
            }),
        ).rows[0].payload;

        expect(payload.level).toBe('middle');
    });

    it('паспорта в шине нет — месяц пишется без него', () => {
        const payload = buildManagerMonthPayload(
            input({ passports: new Map() }),
        ).rows[0].payload;

        expect(payload.passport).toBeNull();
        expect(payload.planSnapshot).not.toBeNull();
    });
});

describe('Правила портала в месяце', () => {
    /** Восемь разборов сентября с оценённым закрытием. */
    function scoredRows(overrides: Partial<DatedLiteRow> = {}): DatedLiteRow[] {
        return Array.from({ length: 8 }, (_, index) =>
            liteRow({
                transcriptionId: `s-${index}`,
                callStartedAt: new Date(`2026-09-0${index + 1}T09:00:00Z`),
                sections: [
                    {
                        section: 'CLOSING',
                        relevance: 80,
                        score: 9,
                        asWas: 'Ну это самое, я перезвоню',
                        alternatives: [],
                    },
                ],
                ...overrides,
            }),
        ) as DatedLiteRow[];
    }

    /** Правило «нет даты следующего шага → закрытие не выше 5». */
    const capRules: AiScoringSettings = {
        caps: [
            {
                ruleCode: 'closing-no-next-step-date',
                condition: 'nextStep.date = null',
                section: 'CLOSING',
                maxScore: 5,
                flag: 'no-next-step-date',
            },
        ],
        stopWords: [],
    };

    it('потолок оценивания месяца доезжает до снапшота и пишет флаг', () => {
        const payload = buildManagerMonthPayload(
            input({
                rows: scoredRows({ nextStep: { set: true, date: null } }),
                settings: portalSettings({ scoring: capRules }),
            }),
        ).rows[0].payload;

        expect(payload.flags).toEqual(['no-next-step-date']);
        expect(payload.caps).toEqual([
            {
                ruleCode: 'closing-no-next-step-date',
                section: 'CLOSING',
                flag: 'no-next-step-date',
                maxScore: 5,
                calls: 8,
                cut: 8,
            },
        ]);
    });

    it('условие правила не выполнено — следа в месяце нет', () => {
        const payload = buildManagerMonthPayload(
            input({
                rows: scoredRows(),
                settings: portalSettings({ scoring: capRules }),
            }),
        ).rows[0].payload;

        expect(payload.caps).toEqual([]);
        expect(payload.flags).toEqual([]);
    });

    it('стоп-фраза месяца попадает в снапшот и объём типа не меняет', () => {
        const payload = buildManagerMonthPayload(
            input({
                rows: scoredRows(),
                settings: portalSettings({
                    scoring: { caps: [], stopWords: ['я перезвоню'] },
                }),
            }),
        ).rows[0].payload;

        expect(payload.stopWords).toEqual(['я перезвоню']);
        expect(payload.byType[0]).toMatchObject({
            callType: 'presentation',
            n: 8,
        });
    });

    it('«презентация» в холодном звонке вычеркнута из знаменателя', () => {
        const payload = buildManagerMonthPayload(
            input({
                rows: scoredRows({
                    callType: 'cold',
                    sections: [
                        {
                            section: 'GREETING',
                            relevance: 90,
                            score: 8,
                            asWas: null,
                            alternatives: [],
                        },
                        {
                            section: 'PRESENTATION',
                            relevance: 70,
                            score: 2,
                            asWas: null,
                            alternatives: [],
                        },
                    ],
                }),
            }),
        ).rows[0].payload;

        expect(payload.applicability).toEqual({
            minRelevance: 30,
            excluded: [{ callType: 'cold', section: 'PRESENTATION', calls: 8 }],
        });
    });

    it('все разделы применимы — след применимости пуст', () => {
        const payload = buildManagerMonthPayload(input({ rows: scoredRows() }))
            .rows[0].payload;

        expect(payload.applicability).toEqual({
            minRelevance: 30,
            excluded: [],
        });
    });
});
