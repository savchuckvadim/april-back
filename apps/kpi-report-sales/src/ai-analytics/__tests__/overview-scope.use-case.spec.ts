import type { AnalyticsCallLiteRow } from '@lib/call-lib';
import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    type DatedLiteRow,
    hasCallDate,
} from '../domain/loaders/lite-row.mapper';
import { liteRow } from './fixtures/lite-row.fixture';
import { callReportWith } from './fixtures/manager-scope.fixture';
import {
    callsOf,
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_NOW,
    OVERVIEW_TO,
    twoManagersRows,
} from './fixtures/overview.fixture';
import { makeOverviewUseCase } from './fixtures/overview-use-case.fixture';

/**
 * Вкладка AI показывает только сотрудников из разбора звонков с учётом
 * фильтра отчёта (решение владельца 30.09.2026): строки, итоги, итоги
 * отделов, возражения — по одному и тому же периметру.
 */
const input = { domain: OVERVIEW_DOMAIN, from: OVERVIEW_FROM, to: OVERVIEW_TO };
const now = { now: OVERVIEW_NOW };

/** Одиночная строка звонка в периоде с датой. */
function rowOf(
    transcriptionId: string,
    overrides: Partial<AnalyticsCallLiteRow>,
): DatedLiteRow[] {
    return [
        liteRow({
            transcriptionId,
            callStartedAt: new Date('2026-08-20T08:00:00Z'),
            ...overrides,
        }),
    ].filter(hasCallDate);
}

const presentationTotal = (totals: { callType: string; n: number }[]) =>
    totals.find(total => total.callType === 'presentation')?.n;

describe('OverviewUseCase: периметр — фильтр отчёта ∩ список разбора', () => {
    it('список разбора без фильтра: строки, итоги и отделы — только по нему; бывший участник скрыт', async () => {
        const { useCase, kpi, roster } = makeOverviewUseCase({
            settings: { callReport: callReportWith([10]) },
        });

        const dto = await useCase.execute(input, now);

        expect(dto.managers.map(row => row.managerId)).toEqual(['10']);
        // У 20 есть разборы в окне, но его нет в списке — в итоги не идут.
        expect(presentationTotal(dto.totals)).toBe(10);
        expect(
            dto.totals.find(total => total.callType === 'presentation')
                ?.managers,
        ).toBe(1);
        expect(dto.departmentTotals.flatMap(group => group.managerIds)).toEqual(
            ['10'],
        );
        expect(dto.meta).toMatchObject({
            totalCalls: 10,
            analyzedCalls: 10,
            scope: { pilotActive: true, shownManagers: 1, hiddenByPilot: 0 },
        });
        expect(kpi.loadKpiMonths).toHaveBeenCalledWith(
            OVERVIEW_DOMAIN,
            OVERVIEW_FROM,
            OVERVIEW_TO,
            [10],
            expect.any(Object),
        );
        // Список действует — ростер ОП не нужен.
        expect(roster).not.toHaveBeenCalled();
    });

    it('явный фильтр ∩ список разбора: в строках пересечение, скрытые посчитаны', async () => {
        const { useCase, kpi } = makeOverviewUseCase({
            settings: { callReport: callReportWith([20, 512]) },
        });

        const dto = await useCase.execute(
            { ...input, managerIds: [10, 20] },
            now,
        );

        expect(dto.managers.map(row => row.managerId)).toEqual(['20']);
        expect(dto.meta.scope).toEqual({
            pilotActive: true,
            shownManagers: 1,
            hiddenByPilot: 1,
        });
        expect(presentationTotal(dto.totals)).toBe(5);
        expect(kpi.loadKpiMonths).toHaveBeenCalledWith(
            OVERVIEW_DOMAIN,
            OVERVIEW_FROM,
            OVERVIEW_TO,
            [20],
            expect.any(Object),
        );
    });

    it('разбор выключен — ограничения нет, строки по фильтру', async () => {
        const { useCase } = makeOverviewUseCase({
            settings: { callReport: callReportWith([10], false) },
        });

        const dto = await useCase.execute(input, now);

        expect(dto.managers.map(row => row.managerId)).toEqual(['10', '20']);
        expect(dto.meta.scope.pilotActive).toBe(false);
        expect(presentationTotal(dto.totals)).toBe(15);
    });

    it('явный фильтр без списка разбора: разборы невыбранного сотрудника не просачиваются', async () => {
        const { useCase } = makeOverviewUseCase();

        const dto = await useCase.execute({ ...input, managerIds: [10] }, now);

        expect(dto.managers.map(row => row.managerId)).toEqual(['10']);
        expect(dto.meta.totalCalls).toBe(10);
        expect(presentationTotal(dto.totals)).toBe(10);
        expect(dto.totals.find(total => total.callType === 'call')?.n).toBe(0);
    });

    it('звонки без сотрудника остаются только в meta.skippedNoManager', async () => {
        const { useCase } = makeOverviewUseCase({
            rows: [
                ...twoManagersRows(),
                ...rowOf('orphan', { managerId: null }),
            ],
            settings: { callReport: callReportWith([10]) },
        });

        const dto = await useCase.execute(input, now);

        expect(dto.meta).toMatchObject({
            totalCalls: 11,
            skippedNoManager: 1,
            analyzedCalls: 10,
        });
        expect(dto.managers.map(row => row.managerId)).toEqual(['10']);
    });

    it('пустое пересечение — пустой обзор без загрузчиков и meta.scope с причиной', async () => {
        const { useCase, calls, kpi } = makeOverviewUseCase({
            settings: { callReport: callReportWith([10]) },
        });

        const dto = await useCase.execute(
            { ...input, managerIds: [20, 30] },
            now,
        );

        expect(dto.managers).toEqual([]);
        expect(dto.departmentTotals).toEqual([]);
        expect(dto.totals.map(total => total.callType)).toEqual([
            ...CALL_REPORT_CALL_TYPE_CODES,
        ]);
        expect(dto.totals.every(total => total.n === 0)).toBe(true);
        expect(dto.meta).toMatchObject({
            totalCalls: 0,
            analyzedCalls: 0,
            scope: { pilotActive: true, shownManagers: 0, hiddenByPilot: 2 },
        });
        expect(dto.period).toMatchObject({
            from: OVERVIEW_FROM,
            to: OVERVIEW_TO,
        });
        expect(calls.loadLite).not.toHaveBeenCalled();
        expect(kpi.loadKpiMonths).not.toHaveBeenCalled();
    });
});

describe('OverviewUseCase: исключения матрицы и порог длительности портала', () => {
    /** 10 презентаций по 120 с, два звонка без типа и один без разбора. */
    const rows = (): DatedLiteRow[] => [
        ...callsOf('10', 10, { durationSec: 120 }),
        ...rowOf('no-type-1', { managerId: '10', callType: null }),
        ...rowOf('no-type-2', { managerId: '10', callType: null }),
        ...rowOf('no-analysis', {
            managerId: '10',
            analysisPresent: false,
            score: null,
        }),
    ];

    it('порог портала не задан — 300 с: звонки по 120 с в оценку не входят', async () => {
        const { useCase } = makeOverviewUseCase({ rows: rows(), roster: [10] });

        const dto = await useCase.execute(input, now);

        expect(dto.meta).toMatchObject({
            analyzedCalls: 0,
            excludedShort: 10,
            excludedNoType: 2,
            excludedNoAnalysis: 1,
        });
    });

    it('возражения считаются по тем же разборам, что n матрицы: старая версия разбора не идёт', async () => {
        const objection: AnalyticsCallLiteRow['objections'][number] = {
            category: 'price',
            quote: 'Дорого',
            handled: true,
            outcome: 'continued',
        };
        const { useCase } = makeOverviewUseCase({
            roster: [10],
            rows: [
                ...callsOf('10', 10, {
                    versions: { prompt: 'focus-v2.3-2026-09-25' },
                    objections: [objection],
                }),
                ...['old-1', 'old-2', 'old-3'].flatMap(id =>
                    rowOf(id, {
                        managerId: '10',
                        versions: { prompt: 'focus-v2.2-2026-09-08' },
                        objections: [objection],
                    }),
                ),
            ],
        });

        const dto = await useCase.execute(input, now);

        expect(dto.meta).toMatchObject({
            analyzedCalls: 10,
            excludedBeforeComparable: 3,
        });
        const [manager] = dto.objections.byManager;
        expect(manager?.byCategory.map(item => item.n)).toEqual([10]);
    });

    it('порог портала 60 с (как у пульса) — те же звонки в оценке', async () => {
        const { useCase } = makeOverviewUseCase({
            rows: rows(),
            roster: [10],
            settings: { minDurationDefined: false, legacyMinDurationSec: 60 },
        });

        const dto = await useCase.execute(input, now);

        expect(dto.meta).toMatchObject({
            analyzedCalls: 10,
            excludedShort: 0,
            excludedNoType: 2,
            excludedNoAnalysis: 1,
        });
        expect(presentationTotal(dto.totals)).toBe(10);
    });
});
