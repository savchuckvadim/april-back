import 'reflect-metadata';
import {
    ClosedSalesDaysLoader,
    closeDayOf,
} from '../domain/loaders/closed-sales-days.loader';
import type {
    ClosedSalesDealDto,
    ClosedSalesEmployeeDto,
} from '../../sales-finance';
import { managersMock } from './fixtures/kpi-loader.fixture';

/**
 * Дни закрытия сделок для воспроизведения журнала прогноза: тот же отчёт
 * закрытых продаж, что у финансов, но по одной строке на сделку.
 */
const DOMAIN = 'example.bitrix24.ru';

function deal(
    id: number,
    assignedId: number,
    closeDate: string,
): ClosedSalesDealDto {
    return {
        id,
        title: `Сделка ${id}`,
        assignedId,
        closeDate,
        opportunity: 0,
        advanceAmount: 0,
        paidMonths: 0,
        monthlyAmount: 0,
        quantity: 1,
        contractStart: null,
        contractEnd: null,
        contractMonths: 12,
        contractTypeCode: null,
        contractTypeName: null,
        expectedContractAmount: 0,
        companyId: null,
        companyName: null,
        companyColor: null,
        companyClientType: null,
    };
}

function employee(
    assignedId: number,
    deals: ClosedSalesDealDto[],
): ClosedSalesEmployeeDto {
    return {
        assignedId,
        dealsCount: deals.length,
        advanceAmount: 0,
        paidMonths: 0,
        monthlyAmount: 0,
        quantity: deals.length,
        expectedContractAmount: 0,
        deals,
    };
}

function makeLoader(employees: ClosedSalesEmployeeDto[], roster = [7, 8]) {
    const executeDetailed = jest.fn().mockResolvedValue({
        report: {
            employees,
            totals: {
                dealsCount: 0,
                advanceAmount: 0,
                paidMonths: 0,
                monthlyAmount: 0,
                quantity: 0,
                expectedContractAmount: 0,
            },
            dateFrom: '2026-09-01',
            dateTo: '2026-09-30',
            generatedAt: '2026-10-05T01:00:00.000Z',
        },
        cachedMonths: ['2026-09'],
    });
    const factory = { create: () => ({ closed: { executeDetailed } }) };
    const managers = managersMock(roster);
    const loader = new ClosedSalesDaysLoader(factory as never, managers.loader);

    return { loader, executeDetailed, managers };
}

describe('closeDayOf', () => {
    it('день закрытия — портальная дата в начале строки CLOSEDATE', () => {
        expect(closeDayOf('2026-09-03T12:00:00+03:00')).toBe('2026-09-03');
        expect(closeDayOf('2026-09-03')).toBe('2026-09-03');
        expect(closeDayOf('')).toBeNull();
        expect(closeDayOf('03.09.2026')).toBeNull();
    });
});

describe('ClosedSalesDaysLoader', () => {
    it('по строке на сделку: менеджер строкой и день закрытия; битая дата отбрасывается', async () => {
        const { loader, executeDetailed } = makeLoader([
            employee(7, [
                deal(1, 7, '2026-09-03T12:00:00+03:00'),
                deal(2, 7, 'не дата'),
            ]),
            employee(8, [deal(3, 8, '2026-09-10T09:00:00+03:00')]),
        ]);

        const days = await loader.load(
            DOMAIN,
            '2026-09-01',
            '2026-09-30',
            [7, 8],
        );

        expect(days).toEqual([
            { managerId: '7', closeDay: '2026-09-03' },
            { managerId: '8', closeDay: '2026-09-10' },
        ]);
        expect(executeDetailed).toHaveBeenCalledWith({
            domain: DOMAIN,
            forceRefresh: false,
            filters: {
                assignedIds: [7, 8],
                dateFrom: '2026-09-01',
                dateTo: '2026-09-30',
            },
        });
    });

    it('принудительное обновление передаётся в отчёт', async () => {
        const { loader, executeDetailed } = makeLoader([]);
        await loader.load(DOMAIN, '2026-09-01', '2026-09-30', [7], {
            forceRefresh: true,
        });
        expect((executeDetailed.mock.calls as unknown[][])[0][0]).toMatchObject(
            {
                forceRefresh: true,
            },
        );
    });

    it('пустой ростер — отчёт не вызывается', async () => {
        const { loader, executeDetailed } = makeLoader([], []);
        expect(await loader.load(DOMAIN, '2026-09-01', '2026-09-30')).toEqual(
            [],
        );
        expect(executeDetailed).not.toHaveBeenCalled();
    });
});
