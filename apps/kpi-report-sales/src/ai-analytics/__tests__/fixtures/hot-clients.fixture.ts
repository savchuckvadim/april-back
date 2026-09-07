/**
 * Фикстуры HotClientsReportDto для финансового хвоста v2: открытые сделки
 * с разными стадиями, цветами компании, типами и сроками договора,
 * с товарными строками и без.
 */
import type {
    HotClientDealDto,
    HotClientsReportDto,
} from '../../../sales-finance';

/** Сделка с нулями и null; переопределения — точечно. */
export function hotDeal(
    assignedId: number,
    stageCode: string,
    monthlyAmount: number,
    overrides: Partial<HotClientDealDto> = {},
): HotClientDealDto {
    return {
        id: 1,
        title: 't',
        assignedId,
        stageCode,
        stageName: '',
        opportunity: 0,
        productRowsAmount: 0,
        monthlyAmount,
        paidMonths: 0,
        quantity: 0,
        contractStart: null,
        contractEnd: null,
        contractTypeCode: null,
        contractTypeName: null,
        opHistory: [],
        opMHistory: [],
        comments: [],
        companyId: null,
        companyName: null,
        companyColor: null,
        companyClientType: null,
        ...overrides,
    };
}

export function hotReport(deals: HotClientDealDto[]): HotClientsReportDto {
    return {
        deals,
        totals: {
            dealsCount: deals.length,
            opportunityTotal: 0,
            productRowsAmountTotal: 0,
            monthlyAmountTotal: 0,
            paidMonthsTotal: 0,
            quantityTotal: 0,
        },
        threshold: 'presentation',
        generatedAt: '',
    };
}

/** Даты договора: полдень UTC, чтобы локальная TZ не сдвигала день. */
const contract = (start: string, end: string) => ({
    contractStart: `${start}T12:00:00.000Z`,
    contractEnd: `${end}T12:00:00.000Z`,
});

/**
 * Шесть сделок менеджера 1 (пайплайн от презентации) + одна вне ростера.
 * «Горячая» = стадия ≥ sales_in_progress (order 8):
 *  1. sales_pres (4), 10 000, стандарт, 12 мес., без строк, зелёная — не горячая
 *  2. sales_refine (5), 20 000, стандарт, 6 мес., строки 120 000, жёлтая — не горячая
 *  3. sales_document_send (7), 30 000, интернет, 3 мес., без строк, без цвета — не горячая
 *  4. sales_in_progress (8), 42 000, интернет, 12 мес., строки 504 000, зелёная — горячая, с предложением
 *  5. sales_money_await (9), 15 000, без типа, дат нет, строки 45 000, красная — горячая, с предложением
 *  6. sales_supply (10), 5 000, стандарт, 36 мес., без строк, цвет вне справочника — горячая, без предложения
 *  9. sales_in_progress, 999, менеджер 9 — вне ростера
 */
export function hotDealsFixture(): HotClientDealDto[] {
    return [
        hotDeal(1, 'sales_pres', 10000, {
            id: 1,
            contractTypeCode: 'garant_standart',
            contractTypeName: 'Стандарт',
            companyColor: 'green',
            ...contract('2026-01-01', '2026-12-31'),
        }),
        hotDeal(1, 'sales_refine', 20000, {
            id: 2,
            productRowsAmount: 120000,
            contractTypeCode: 'garant_standart',
            contractTypeName: 'Стандарт',
            companyColor: 'yellow',
            ...contract('2026-03-01', '2026-08-31'),
        }),
        hotDeal(1, 'sales_document_send', 30000, {
            id: 3,
            contractTypeCode: 'garant_internet',
            contractTypeName: 'Интернет-версия',
            ...contract('2026-06-01', '2026-08-31'),
        }),
        hotDeal(1, 'sales_in_progress', 42000, {
            id: 4,
            productRowsAmount: 504000,
            contractTypeCode: 'garant_internet',
            contractTypeName: 'Интернет-версия',
            companyColor: 'green',
            ...contract('2026-09-01', '2027-08-31'),
        }),
        hotDeal(1, 'sales_money_await', 15000, {
            id: 5,
            productRowsAmount: 45000,
            companyColor: 'red',
        }),
        hotDeal(1, 'sales_supply', 5000, {
            id: 6,
            contractTypeCode: 'garant_standart',
            contractTypeName: 'Стандарт',
            companyColor: 'blue',
            ...contract('2026-01-01', '2028-12-31'),
        }),
        hotDeal(9, 'sales_in_progress', 999, { id: 9 }),
    ];
}
