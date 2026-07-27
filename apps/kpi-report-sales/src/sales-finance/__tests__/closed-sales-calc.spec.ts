import { IBXDeal } from '@/modules/bitrix';
import {
    aggregateClosedSales,
    buildClosedSalesDeal,
} from '../domain/calc/closed-sales-calc';
import { SalesFinanceUfFields } from '../domain/services/sales-finance-deal-query.service';

const UF: SalesFinanceUfFields = {
    contractStart: 'UF_CRM_CONTRACT_START',
    contractEnd: 'UF_CRM_CONTRACT_END',
    contractType: 'UF_CRM_CONTRACT_TYPE',
    opHistory: 'UF_CRM_OP_HISTORY',
    presComments: 'UF_CRM_PRES_COMMENTS',
};

/** Карта элементов «Типа договора»: numeric id элемента → code. */
const CONTRACT_TYPE_ITEMS: ReadonlyMap<number, string> = new Map([
    [301, 'garant_standart'],
]);
const NO_ITEMS: ReadonlyMap<number, string> = new Map();

function wonDeal(overrides: Partial<IBXDeal> = {}): IBXDeal {
    return {
        ID: 100,
        TITLE: 'Сделка',
        ASSIGNED_BY_ID: '123',
        CLOSEDATE: '2026-03-15T10:00:00+03:00',
        OPPORTUNITY: '144000',
        UF_CRM_CONTRACT_START: '2026-03-01',
        UF_CRM_CONTRACT_END: '2027-02-28',
        ...overrides,
    } as IBXDeal;
}

const NO_COMPANIES = new Map<
    number,
    { title: string; color: string | null; clientTypeCode: string | null }
>();

describe('buildClosedSalesDeal', () => {
    it('аванс, месяцы и ожидаемая сумма для договора на 12 месяцев', () => {
        const deal = buildClosedSalesDeal(
            wonDeal(),
            [{ price: 12000, quantity: 1, measureName: 'лиц.12мес.' }],
            UF,
            NO_COMPANIES,
            NO_ITEMS,
        );

        expect(deal.advanceAmount).toBe(12000);
        expect(deal.paidMonths).toBe(12);
        expect(deal.monthlyAmount).toBe(1000); // 12000 / 12
        expect(deal.quantity).toBe(1);
        expect(deal.contractMonths).toBe(12); // 01.03.2026–28.02.2027
        expect(deal.expectedContractAmount).toBe(12000); // 1000 × 12
    });

    it('сделка без товарных строк даёт нулевые финансовые показатели', () => {
        const deal = buildClosedSalesDeal(
            wonDeal(),
            [],
            UF,
            NO_COMPANIES,
            NO_ITEMS,
        );
        expect(deal.advanceAmount).toBe(0);
        expect(deal.paidMonths).toBe(0);
        expect(deal.monthlyAmount).toBe(0);
        expect(deal.expectedContractAmount).toBe(0);
    });

    it('компания: id и название из карты; COMPANY_ID 0/пусто → null', () => {
        const withCompany = buildClosedSalesDeal(
            wonDeal({ COMPANY_ID: '512' }),
            [],
            UF,
            new Map([
                [
                    512,
                    {
                        title: 'ООО Ромашка',
                        color: 'green',
                        clientTypeCode: 'commerc',
                    },
                ],
            ]),
            NO_ITEMS,
        );
        expect(withCompany.companyId).toBe(512);
        expect(withCompany.companyName).toBe('ООО Ромашка');
        expect(withCompany.companyClientType).toBe('commerc');

        const unknownCompany = buildClosedSalesDeal(
            wonDeal({ COMPANY_ID: '77' }),
            [],
            UF,
            NO_COMPANIES,
            NO_ITEMS,
        );
        expect(unknownCompany.companyId).toBe(77);
        expect(unknownCompany.companyName).toBeNull();

        const noCompany = buildClosedSalesDeal(
            wonDeal({ COMPANY_ID: '0' }),
            [],
            UF,
            NO_COMPANIES,
            NO_ITEMS,
        );
        expect(noCompany.companyId).toBeNull();
        expect(noCompany.companyName).toBeNull();
    });

    it('тип договора: numeric id элемента → code; неизвестный/пустой → null', () => {
        const resolved = buildClosedSalesDeal(
            wonDeal({ UF_CRM_CONTRACT_TYPE: '301' } as Partial<IBXDeal>),
            [],
            UF,
            NO_COMPANIES,
            CONTRACT_TYPE_ITEMS,
        );
        expect(resolved.contractTypeCode).toBe('garant_standart');

        const unknown = buildClosedSalesDeal(
            wonDeal({ UF_CRM_CONTRACT_TYPE: '999' } as Partial<IBXDeal>),
            [],
            UF,
            NO_COMPANIES,
            CONTRACT_TYPE_ITEMS,
        );
        expect(unknown.contractTypeCode).toBeNull();

        const empty = buildClosedSalesDeal(
            wonDeal(),
            [],
            UF,
            NO_COMPANIES,
            CONTRACT_TYPE_ITEMS,
        );
        expect(empty.contractTypeCode).toBeNull();
    });

    it('без дат договора contractMonths = 0, даты null', () => {
        const deal = buildClosedSalesDeal(
            wonDeal({
                UF_CRM_CONTRACT_START: undefined,
                UF_CRM_CONTRACT_END: undefined,
            }),
            [{ price: 1000, quantity: 1, measureName: 'шт' }],
            UF,
            NO_COMPANIES,
            NO_ITEMS,
        );
        expect(deal.contractStart).toBeNull();
        expect(deal.contractEnd).toBeNull();
        expect(deal.contractMonths).toBe(0);
        expect(deal.expectedContractAmount).toBe(0);
    });
});

describe('aggregateClosedSales', () => {
    it('группирует по сотрудникам и считает итоги', () => {
        const dealA = buildClosedSalesDeal(
            wonDeal({ ID: 1, ASSIGNED_BY_ID: '10' }),
            [{ price: 1200, quantity: 1, measureName: 'лиц.12мес.' }],
            UF,
            NO_COMPANIES,
            NO_ITEMS,
        );
        const dealB = buildClosedSalesDeal(
            wonDeal({ ID: 2, ASSIGNED_BY_ID: '20' }),
            [{ price: 600, quantity: 1, measureName: 'лиц.6мес.' }],
            UF,
            NO_COMPANIES,
            NO_ITEMS,
        );
        const dealC = buildClosedSalesDeal(
            wonDeal({ ID: 3, ASSIGNED_BY_ID: '10' }),
            [{ price: 1200, quantity: 2, measureName: 'лиц.12мес.' }],
            UF,
            NO_COMPANIES,
            NO_ITEMS,
        );

        const { employees, totals } = aggregateClosedSales([
            dealA,
            dealB,
            dealC,
        ]);

        expect(totals.dealsCount).toBe(3);
        expect(totals.advanceAmount).toBe(1200 + 600 + 2400);
        expect(totals.paidMonths).toBe(12 + 6 + 24);
        expect(totals.quantity).toBe(1 + 1 + 2);

        expect(employees).toHaveLength(2);
        const [emp10, emp20] = employees;
        expect(emp10.assignedId).toBe(10);
        expect(emp10.dealsCount).toBe(2);
        expect(emp10.deals.map(deal => deal.id)).toEqual([1, 3]);
        expect(emp20.assignedId).toBe(20);
        expect(emp20.dealsCount).toBe(1);
    });

    it('пустой список даёт пустые итоги', () => {
        const { employees, totals } = aggregateClosedSales([]);
        expect(employees).toEqual([]);
        expect(totals.dealsCount).toBe(0);
    });
});
