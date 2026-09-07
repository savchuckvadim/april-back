import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { isCallTypeCode } from '@lib/sales-ai-analytics';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { applyOverviewPerimeter } from '../domain/presenter/overview.presenter';
import { ByTypeUseCase } from '../domain/use-cases/by-type.use-case';
import { OverviewLookup } from '../domain/use-cases/overview-lookup.use-case';
import { AiOverviewDto } from '../dto/ai-overview.dto';
import {
    callsOf,
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_TO,
    overviewFixture,
} from './fixtures/overview.fixture';

const KEY = 'k';
const request = {
    domain: OVERVIEW_DOMAIN,
    requesterUserId: '447',
    from: OVERVIEW_FROM,
    to: OVERVIEW_TO,
};
const leader: RequesterAccess = { role: 'cup', visibleManagerIds: null };

/** Менеджер 10: 10 презентаций с разделами и возражением; 20: 3 звонка. */
function overview(): AiOverviewDto {
    const rows = [
        ...callsOf('10', 10, {
            sections: [
                {
                    section: 'PRICE',
                    relevance: 1,
                    score: 4,
                    asWas: '',
                    alternatives: [],
                },
            ],
            objections: [
                {
                    category: 'price',
                    quote: 'Дорого',
                    handled: true,
                    outcome: 'continued',
                },
            ],
        }),
        ...callsOf('20', 3, { callType: 'call' }),
    ];
    return overviewFixture(rows, [10, 20]);
}

function makeUseCase(data: AiOverviewDto | null) {
    const lookup = {
        lookup: jest.fn(
            (_dto: unknown, access: RequesterAccess): Promise<OverviewLookup> =>
                Promise.resolve(
                    data
                        ? {
                              status: 'ready',
                              requestKey: KEY,
                              data: applyOverviewPerimeter(data, access, true),
                          }
                        : { status: 'processing', requestKey: KEY, jobId: KEY },
                ),
        ),
    };
    return new ByTypeUseCase(lookup as never);
}

describe('ByTypeUseCase', () => {
    it('long: строки «сотрудник | показатель | оценка | объяснение» — оценка, разделы, чек-листы, KPI', async () => {
        const useCase = makeUseCase(overview());
        const response = await useCase.execute(
            { ...request, callType: 'presentation', layout: 'long' },
            leader,
        );
        expect(response.status).toBe('ready');
        expect(response.requestKey).toBe(KEY);
        const data = response.data;
        expect(data?.layout).toBe('long');
        expect(data?.wide).toBeNull();
        expect(data?.totals?.callType).toBe('presentation');
        expect(data?.totalsByType).toBeNull();

        const all = data?.long ?? [];
        // Ячейка типа есть у каждого менеджера периметра (у 20 — n = 0).
        expect(new Set(all.map(row => row.managerId))).toEqual(
            new Set(['10', '20']),
        );
        for (const row of all) {
            expect(row.callType).toBe('presentation');
            expect(typeof row.managerId).toBe('string');
            expect(typeof row.indicator).toBe('string');
            expect(row.title.length).toBeGreaterThan(0);
            expect(typeof row.metric.n).toBe('number');
            expect(row.explanation.length).toBeGreaterThan(0);
        }
        const rows = all.filter(row => row.managerId === '10');
        expect(rows[0]).toMatchObject({ kind: 'score', indicator: 'score' });
        expect(rows[0].metric.value).not.toBeNull();
        expect(
            rows.some(
                row => row.kind === 'section' && row.indicator === 'PRICE',
            ),
        ).toBe(true);
        expect(
            rows.some(
                row =>
                    row.kind === 'checklist' &&
                    row.indicator === 'nextStepDateRatePct',
            ),
        ).toBe(true);
        expect(rows.some(row => row.kind === 'kpi')).toBe(true);
        // Порядок видов фиксирован: score → section → checklist → kpi.
        const order = ['score', 'section', 'checklist', 'kpi'];
        const kinds = rows.map(row => order.indexOf(row.kind));
        expect([...kinds].sort((a, b) => a - b)).toEqual(kinds);
        // У менеджера без презентаций — оценка «мало данных».
        const idle = all.find(
            row => row.managerId === '20' && row.kind === 'score',
        );
        expect(idle?.metric.value).toBeNull();
    });

    it('wide (по умолчанию): строка на менеджера с ячейкой, KPI и финансами', async () => {
        const useCase = makeUseCase(overview());
        const response = await useCase.execute(
            { ...request, callType: 'call' },
            leader,
        );
        expect(response.data?.layout).toBe('wide');
        expect(response.data?.long).toBeNull();
        expect(response.data?.totals?.callType).toBe('call');
        expect(response.data?.totalsByType).toBeNull();
        expect(response.data?.wide?.map(row => row.managerId)).toEqual([
            '10',
            '20',
        ]);
        const row = response.data?.wide?.[1];
        expect(row?.level).toBe('middle');
        expect(row?.cell.callType).toBe('call');
        expect(row?.cell.n).toBe(3);
        expect(row?.finance.salesCount).toBe(0);
        expect(response.data?.wide?.[0].cell.n).toBe(0);
    });

    it('objections: сквозной срез, long — строки по категориям, периметр менеджера', async () => {
        const useCase = makeUseCase(overview());
        const response = await useCase.execute(
            {
                ...request,
                requesterUserId: '10',
                callType: 'objections',
                layout: 'long',
            },
            { role: 'manager', visibleManagerIds: ['10'] },
        );
        const data = response.data;
        expect(data?.callType).toBe('objections');
        expect(data?.totals).toBeNull();
        expect(data?.totalsByType).toBeNull();
        expect(data?.objections?.byManager.map(row => row.managerId)).toEqual([
            '10',
        ]);
        expect(data?.long?.[0]).toMatchObject({
            managerId: '10',
            callType: 'objections',
            kind: 'objection',
            indicator: 'price',
        });
    });

    it('all / wide: строка на каждую пару менеджер × тип — порядок менеджеров обзора, типы справочника', async () => {
        const data = overview();
        const response = await makeUseCase(data).execute(
            { ...request, callType: 'all' },
            leader,
        );
        const slice = response.data;
        expect(slice?.callType).toBe('all');
        expect(slice?.title).toBe('Все типы');
        expect(slice?.layout).toBe('wide');
        expect(slice?.long).toBeNull();
        expect(slice?.totals).toBeNull();
        expect(slice?.objections).toBeNull();
        expect(slice?.totalsByType).toEqual(data.totals);

        const wide = slice?.wide ?? [];
        // Строк — сумма ячеек по менеджерам: у каждого ячейка на весь
        // справочник, включая other и irrelevant.
        const cellsTotal = data.managers.reduce(
            (sum, row) => sum + row.byType.length,
            0,
        );
        expect(cellsTotal).toBe(
            data.managers.length * CALL_REPORT_CALL_TYPE_CODES.length,
        );
        expect(wide).toHaveLength(cellsTotal);
        // Порядок детерминирован: менеджеры в порядке обзора, строки одного
        // менеджера идут подряд (по ячейке на каждый тип, без чередования).
        expect(wide.map(row => row.managerId)).toEqual(
            data.managers.flatMap(row => row.byType.map(() => row.managerId)),
        );
        for (const managerId of ['10', '20']) {
            expect(
                wide
                    .filter(row => row.managerId === managerId)
                    .map(row => row.cell.callType),
            ).toEqual([...CALL_REPORT_CALL_TYPE_CODES]);
        }
        for (const row of wide) {
            expect(isCallTypeCode(row.cell.callType)).toBe(true);
            expect(row.primaryKpi).toEqual(row.cell.primaryKpi);
        }
        const presentation = wide.find(
            row =>
                row.managerId === '10' && row.cell.callType === 'presentation',
        );
        expect(presentation?.cell.n).toBe(10);
        expect(presentation?.level).toBe('middle');
    });

    it('all / long: каждая строка несёт callType своего типа; итоги — по всем типам', async () => {
        const data = overview();
        const useCase = makeUseCase(data);
        const response = await useCase.execute(
            { ...request, callType: 'all', layout: 'long' },
            leader,
        );
        const slice = response.data;
        expect(slice?.layout).toBe('long');
        expect(slice?.wide).toBeNull();
        expect(slice?.totals).toBeNull();
        expect(slice?.objections).toBeNull();
        expect(slice?.totalsByType?.map(item => item.callType)).toEqual(
            data.totals.map(item => item.callType),
        );

        const long = slice?.long ?? [];
        expect(long.length).toBeGreaterThan(0);
        for (const row of long) {
            expect(isCallTypeCode(row.callType)).toBe(true);
        }
        expect(new Set(long.map(row => row.callType))).toEqual(
            new Set(CALL_REPORT_CALL_TYPE_CODES),
        );
        // Строки типа в all совпадают с одиночным срезом того же типа.
        const single = await useCase.execute(
            { ...request, callType: 'presentation', layout: 'long' },
            leader,
        );
        expect(long.filter(row => row.callType === 'presentation')).toEqual(
            single.data?.long,
        );
    });

    it('обзор ещё считается → конверт обзора', async () => {
        const useCase = makeUseCase(null);
        expect(
            await useCase.execute({ ...request, callType: 'call' }, leader),
        ).toEqual({ status: 'processing', requestKey: KEY, jobId: KEY });
    });
});
