import { IBXDeal } from '@/modules/bitrix';
import {
    buildHotClientDeal,
    buildHotClientsTotals,
} from '../domain/calc/hot-clients-calc';
import { SalesFinanceUfFields } from '../domain/services/sales-finance-deal-query.service';

const UF: SalesFinanceUfFields = {
    contractStart: 'UF_CRM_CONTRACT_START',
    contractEnd: 'UF_CRM_CONTRACT_END',
    opHistory: 'UF_CRM_OP_HISTORY',
    presComments: 'UF_CRM_PRES_COMMENTS',
};

function openDeal(overrides: Partial<IBXDeal> = {}): IBXDeal {
    return {
        ID: 200,
        TITLE: 'Горячая сделка',
        ASSIGNED_BY_ID: '123',
        STAGE_ID: 'C7:OFFER_CREATE',
        OPPORTUNITY: '50000',
        UF_CRM_OP_HISTORY: ['12.05 Презентация', '20.05 КП'],
        UF_CRM_PRES_COMMENTS: ['Просят скидку'],
        ...overrides,
    } as IBXDeal;
}

const NO_COMPANIES = new Map<number, { title: string; color: string | null }>();

describe('buildHotClientDeal', () => {
    it('собирает строку сделки со стадией, суммами и историей', () => {
        const deal = buildHotClientDeal(
            openDeal({ COMPANY_ID: '512' }),
            [{ price: 5000, quantity: 1, measureName: 'лиц.12мес.' }],
            { code: 'sales_offer_create', name: 'Документы' },
            UF,
            new Map([[512, { title: 'ООО Лютик', color: 'yellow' }]]),
        );

        expect(deal.id).toBe(200);
        expect(deal.stageCode).toBe('sales_offer_create');
        expect(deal.stageName).toBe('Документы');
        expect(deal.opportunity).toBe(50000);
        expect(deal.productRowsAmount).toBe(5000);
        expect(deal.monthlyAmount).toBe(416.67); // 5000 / 12
        expect(deal.paidMonths).toBe(12); // 1 × лиц.12мес.
        expect(deal.quantity).toBe(1);
        expect(deal.opHistory).toEqual(['12.05 Презентация', '20.05 КП']);
        expect(deal.comments).toEqual(['Просят скидку']);
        expect(deal.companyId).toBe(512);
        expect(deal.companyName).toBe('ООО Лютик');
    });

    it('строковое значение истории нормализуется в массив', () => {
        const deal = buildHotClientDeal(
            openDeal({ UF_CRM_OP_HISTORY: 'одна запись' }),
            [],
            undefined,
            UF,
            NO_COMPANIES,
        );
        expect(deal.opHistory).toEqual(['одна запись']);
        expect(deal.stageCode).toBe('C7:OFFER_CREATE'); // fallback на STAGE_ID
        expect(deal.stageName).toBe('');
        expect(deal.companyId).toBeNull(); // COMPANY_ID не запрошен/пуст
    });
});

describe('buildHotClientsTotals', () => {
    it('итоги суммируют показатели сделок', () => {
        const dealA = buildHotClientDeal(
            openDeal({ ID: 1, OPPORTUNITY: '100' }),
            [{ price: 100, quantity: 1, measureName: 'шт' }],
            undefined,
            UF,
            NO_COMPANIES,
        );
        const dealB = buildHotClientDeal(
            openDeal({ ID: 2, OPPORTUNITY: '200' }),
            [{ price: 1200, quantity: 1, measureName: 'лиц.12мес.' }],
            undefined,
            UF,
            NO_COMPANIES,
        );

        const totals = buildHotClientsTotals([dealA, dealB]);
        expect(totals.dealsCount).toBe(2);
        expect(totals.opportunityTotal).toBe(300);
        expect(totals.productRowsAmountTotal).toBe(1300);
        expect(totals.monthlyAmountTotal).toBe(200); // 100 + 100
        expect(totals.paidMonthsTotal).toBe(13); // шт(1) + лиц.12мес.(12)
        expect(totals.quantityTotal).toBe(2); // 1 + 1
    });
});
