import { IBXDeal } from '@/modules/bitrix';
import { IBXProductRowRow } from '@/modules/bitrix/domain/crm/product-row/interface/bx-product-row.interface';
import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../cache/sales-finance-cache.service';
import {
    aggregateClosedSales,
    buildClosedSalesDeal,
} from '../domain/calc/closed-sales-calc';
import { SalesFinanceUfFields } from '../domain/services/sales-finance-deal-query.service';
import { ClosedSalesUseCase } from '../domain/use-cases/closed-sales.use-case';
import { ClosedSalesReportDto } from '../dto/closed-sales-response.dto';

/**
 * Вкладка «Финансы» после перехода на общий на домен кэш закрытого месяца
 * даёт ТЕ ЖЕ числа, что прямой запрос сделок по сотрудникам (прежняя
 * схема), — и для страницы одного сотрудника, и для команды; строка
 * сотрудника в командном отчёте совпадает с его личным отчётом.
 */

const DOMAIN = 'april.bitrix24.ru';
const FROM = '2026-05-01';
const TO = '2026-07-24';

/** Как use-case резолвит UF-поля в моке портала (UF_CRM_{CODE}). */
const UF: SalesFinanceUfFields = {
    contractStart: 'UF_CRM_CONTRACT_START',
    contractEnd: 'UF_CRM_CONTRACT_END',
    contractType: 'UF_CRM_CONTRACT_TYPE',
    opHistory: 'UF_CRM_OP_HISTORY',
    opMHistory: 'UF_CRM_OP_MHISTORY',
    presComments: 'UF_CRM_PRES_COMMENTS',
};

function rawDeal(id: number, assignedId: number, closeDate: string): IBXDeal {
    const deal: Partial<IBXDeal> = {
        ID: id,
        TITLE: `Сделка ${id}`,
        ASSIGNED_BY_ID: String(assignedId),
        CLOSEDATE: `${closeDate}T12:00:00+03:00`,
        OPPORTUNITY: '0',
        DATE_MODIFY: `${closeDate}T12:00:00+03:00`,
        CATEGORY_ID: '7',
        STAGE_SEMANTIC_ID: 'S',
        UF_CRM_CONTRACT_START: '2026-06-01',
        UF_CRM_CONTRACT_END: '2027-05-31',
    };
    return deal as IBXDeal;
}

/** Выигранные сделки воронки: 30 — вне команды, май и июнь закрыты. */
const DEALS: IBXDeal[] = [
    rawDeal(1, 10, '2026-06-03'),
    rawDeal(2, 20, '2026-06-17'),
    rawDeal(3, 30, '2026-06-20'),
    rawDeal(4, 10, '2026-05-30'),
    rawDeal(5, 10, '2026-07-10'),
    rawDeal(6, 20, '2026-07-22'),
];

const ROWS: Record<number, IBXProductRowRow[]> = {
    1: [{ price: 1200, quantity: 1, measureName: 'лиц.12мес.' }],
    2: [{ price: 600, quantity: 2, measureName: 'лиц.6мес.' }],
    3: [{ price: 99999, quantity: 1, measureName: 'лиц.12мес.' }],
    4: [{ price: 2400, quantity: 1, measureName: 'лиц.12мес.' }],
    5: [{ price: 300, quantity: 3, measureName: 'лиц.3мес.' }],
    6: [{ price: 1200, quantity: 1, measureName: 'лиц.12мес.' }],
};

const closeDay = (deal: IBXDeal): string => String(deal.CLOSEDATE).slice(0, 10);

/** crm.deal.list: воронка, период CLOSEDATE и (если есть) IN по ответственным. */
function dealAllMock(): jest.Mock {
    return jest.fn((filter: Record<string, unknown>) => {
        const assigned = filter['=ASSIGNED_BY_ID'] as string[] | undefined;
        return Promise.resolve(
            DEALS.filter(
                deal =>
                    deal.CATEGORY_ID === filter.CATEGORY_ID &&
                    closeDay(deal) >= String(filter['>=CLOSEDATE']) &&
                    closeDay(deal) <= String(filter['<=CLOSEDATE']) &&
                    (!assigned ||
                        assigned.includes(String(deal.ASSIGNED_BY_ID))),
            ),
        );
    });
}

/** Батч товарных строк: копит rows_{id} и отдаёт строки фикстуры. */
function productRowsBatchMock() {
    let pending: number[] = [];
    return {
        list: jest.fn((cmdKey: string) => {
            pending.push(Number(cmdKey.replace('rows_', '')));
        }),
        call: jest.fn(() => {
            const result = Object.fromEntries(
                pending.map(id => [`rows_${id}`, { productRows: ROWS[id] }]),
            );
            pending = [];
            return Promise.resolve([{ result }]);
        }),
    };
}

/** Кэш в памяти (как AppCache: ключ → значение). */
function memoryCache() {
    const store = new Map<string, unknown>();
    const service = {
        getJson: jest.fn((key: string) =>
            Promise.resolve(store.has(key) ? store.get(key) : null),
        ),
        setJson: jest.fn((key: string, value: unknown) => {
            store.set(key, value);
            return Promise.resolve();
        }),
        getJsonMany: jest.fn((keys: string[]) =>
            Promise.resolve(keys.map(key => store.get(key) ?? null)),
        ),
        setJsonMany: jest.fn((entries: { key: string; value: unknown }[]) => {
            entries.forEach(entry => store.set(entry.key, entry.value));
            return Promise.resolve();
        }),
    };
    return { store, service: service as unknown as SalesFinanceCacheService };
}

function makeUseCase() {
    const dealAll = dealAllMock();
    const rows = productRowsBatchMock();
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                deal: {
                    all: dealAll,
                    getFieldsList: jest.fn().mockResolvedValue({ result: [] }),
                },
                company: { all: jest.fn().mockResolvedValue([]) },
                batch: { productRow: { list: rows.list } },
                api: { callBatchWithConcurrency: rows.call },
            },
            PortalModel: {
                getDealCategoryByCode: () => ({ bitrixId: '7', stages: [] }),
                getDealFieldBitrixIdByCode: (code: string) =>
                    `UF_CRM_${code.toUpperCase()}`,
                getDealFieldByCode: () => undefined,
                getCompanyFieldByCode: () => undefined,
                getFieldBitrixId: () => '',
            },
        }),
    } as unknown as PBXService;
    const cache = memoryCache();
    return {
        useCase: new ClosedSalesUseCase(pbx, cache.service),
        dealAll,
        cache,
    };
}

/**
 * Прежняя схема: сделки запрашивались сразу по сотрудникам — отчёт = та же
 * агрегация по сделкам сотрудников фильтра за период.
 */
function directReport(assignedIds: number[]) {
    const deals = DEALS.filter(
        deal =>
            assignedIds.includes(Number(deal.ASSIGNED_BY_ID)) &&
            closeDay(deal) >= FROM &&
            closeDay(deal) <= TO,
    ).map(deal =>
        buildClosedSalesDeal(
            deal,
            ROWS[Number(deal.ID)],
            UF,
            new Map(),
            new Map(),
        ),
    );
    return aggregateClosedSales(deals);
}

const request = (assignedIds: number[]) => ({
    domain: DOMAIN,
    forceRefresh: false,
    filters: { assignedIds, dateFrom: FROM, dateTo: TO },
});

/** Сотрудник отчёта со сделками в порядке id (сегменты идут по месяцам). */
function employeeOf(report: ClosedSalesReportDto, assignedId: number) {
    const employee = report.employees.find(
        item => item.assignedId === assignedId,
    );
    return employee
        ? {
              ...employee,
              deals: [...employee.deals].sort((a, b) => a.id - b.id),
          }
        : undefined;
}

describe('Вкладка «Финансы» на общем кэше месяца: числа как раньше', () => {
    beforeAll(() => {
        jest.useFakeTimers({ now: new Date(2026, 6, 24, 12) }); // 24.07.2026
    });
    afterAll(() => {
        jest.useRealTimers();
    });

    it('один сотрудник: итоги и строки совпадают с прямым запросом по нему', async () => {
        const { useCase } = makeUseCase();

        const report = await useCase.execute(request([10]));
        const expected = directReport([10]);

        expect(report.totals).toEqual(expected.totals);
        expect(report.totals.dealsCount).toBe(3);
        expect(report.employees.map(item => item.assignedId)).toEqual([10]);
        expect(employeeOf(report, 10)).toEqual(
            employeeOf({ ...report, employees: expected.employees }, 10),
        );
    });

    it('команда: итоги как у прямого запроса, строка сотрудника = его личный отчёт', async () => {
        const { useCase } = makeUseCase();

        const single = await useCase.execute(request([10]));
        const team = await useCase.execute(request([10, 20]));
        const expected = directReport([10, 20]);

        expect(team.totals).toEqual(expected.totals);
        expect(team.employees.map(item => item.assignedId)).toEqual([10, 20]);
        expect(employeeOf(team, 10)).toEqual(employeeOf(single, 10));
        expect(employeeOf(team, 20)).toEqual(
            employeeOf({ ...team, employees: expected.employees }, 20),
        );
    });

    it('закрытые месяцы общие: второй состав не ходит в Bitrix за маем и июнем, чужие сделки в отчёт не попадают', async () => {
        const { useCase, dealAll, cache } = makeUseCase();

        await useCase.execute(request([10]));
        const callsAfterSingle = dealAll.mock.calls.length;
        const team = await useCase.execute(request([10, 20]));

        // май и июнь — по домену, июль — по сотрудникам
        expect(callsAfterSingle).toBe(3);
        // команда перечитала только живой июль
        expect(dealAll.mock.calls.length - callsAfterSingle).toBe(1);
        const june = cache.store.get(
            `sales-finance:v8:${DOMAIN}:closed:month:2026-06`,
        ) as { id: number }[];
        expect(june.map(deal => deal.id).sort()).toEqual([1, 2, 3]);
        expect(employeeOf(team, 30)).toBeUndefined();
    });
});
