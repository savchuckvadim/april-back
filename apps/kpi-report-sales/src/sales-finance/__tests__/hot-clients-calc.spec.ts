import { IBXDeal } from '@/modules/bitrix';
import {
    buildHotClientDeal,
    buildHotClientsTotals,
} from '../domain/calc/hot-clients-calc';
import { SalesFinanceUfFields } from '../domain/services/sales-finance-deal-query.service';

const UF: SalesFinanceUfFields = {
    contractStart: 'UF_CRM_CONTRACT_START',
    contractEnd: 'UF_CRM_CONTRACT_END',
    contractType: 'UF_CRM_CONTRACT_TYPE',
    opHistory: 'UF_CRM_OP_HISTORY',
    opMHistory: 'UF_CRM_OP_MHISTORY',
    presComments: 'UF_CRM_PRES_COMMENTS',
};

/** Живой словарь «Типа договора»: numeric id элемента → {code, name}. */
const CONTRACT_TYPE_ITEMS: ReadonlyMap<number, { code: string; name: string }> =
    new Map([[301, { code: 'garant_standart', name: 'Гарант Стандарт' }]]);
const NO_ITEMS: ReadonlyMap<number, { code: string; name: string }> = new Map();

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

const NO_COMPANIES = new Map<
    number,
    { title: string; color: string | null; clientTypeCode: string | null }
>();

describe('buildHotClientDeal', () => {
    it('собирает строку сделки со стадией, суммами и историей', () => {
        const deal = buildHotClientDeal(
            openDeal({
                COMPANY_ID: '512',
                UF_CRM_CONTRACT_START: '2026-03-01',
                UF_CRM_CONTRACT_END: '2027-02-28',
                UF_CRM_CONTRACT_TYPE: '301',
                UF_CRM_OP_MHISTORY: ['12.05 просили перезвонить'],
            } as Partial<IBXDeal>),
            [{ price: 5000, quantity: 1, measureName: 'лиц.12мес.' }],
            { code: 'sales_offer_create', name: 'Документы' },
            UF,
            new Map([
                [
                    512,
                    {
                        title: 'ООО Лютик',
                        color: 'yellow',
                        clientTypeCode: 'state',
                    },
                ],
            ]),
            CONTRACT_TYPE_ITEMS,
        );

        expect(deal.id).toBe(200);
        expect(deal.stageCode).toBe('sales_offer_create');
        expect(deal.stageName).toBe('Документы');
        expect(deal.opportunity).toBe(50000);
        expect(deal.productRowsAmount).toBe(5000);
        expect(deal.monthlyAmount).toBe(416.67); // 5000 / 12
        expect(deal.paidMonths).toBe(12); // 1 × лиц.12мес.
        expect(deal.quantity).toBe(1);
        expect(deal.contractStart).not.toBeNull();
        expect(deal.contractEnd).not.toBeNull();
        expect(deal.contractTypeCode).toBe('garant_standart');
        expect(deal.contractTypeName).toBe('Гарант Стандарт');
        expect(deal.opHistory).toEqual(['12.05 Презентация', '20.05 КП']);
        expect(deal.opMHistory).toEqual(['12.05 просили перезвонить']);
        expect(deal.comments).toEqual(['Просят скидку']);
        expect(deal.companyId).toBe(512);
        expect(deal.companyName).toBe('ООО Лютик');
        expect(deal.companyClientType).toBe('state');
    });

    it('строковое значение истории нормализуется в массив', () => {
        const deal = buildHotClientDeal(
            openDeal({ UF_CRM_OP_HISTORY: 'одна запись' }),
            [],
            undefined,
            UF,
            NO_COMPANIES,
            NO_ITEMS,
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
            NO_ITEMS,
        );
        const dealB = buildHotClientDeal(
            openDeal({ ID: 2, OPPORTUNITY: '200' }),
            [{ price: 1200, quantity: 1, measureName: 'лиц.12мес.' }],
            undefined,
            UF,
            NO_COMPANIES,
            NO_ITEMS,
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
