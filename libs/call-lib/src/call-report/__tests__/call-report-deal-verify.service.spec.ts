import { CallReportDealVerifyService } from '../services/call-report-deal-verify.service';

const DOMAIN = 'alfacentr.bitrix24.ru';

/** Воронки портала: основная — 0, презентации — 12, ХО — 14. */
const CATEGORIES: Record<string, { bitrixId: number } | undefined> = {
    sales_base: { bitrixId: 0 },
    sales_presentation: { bitrixId: 12 },
    sales_xo: { bitrixId: 14 },
};

type Deal = Record<string, unknown>;

const makeDeps = (deals: Record<string, Deal | null>) => {
    const call = jest.fn((method: string, data: Record<string, unknown>) =>
        method === 'crm.deal.get'
            ? Promise.resolve({ result: deals[String(data.id)] ?? null })
            : Promise.resolve({ result: null }),
    );
    const portal = {
        getDealCategoryByCode: jest.fn((code: string) => CATEGORIES[code]),
        getEntityFieldByCode: jest.fn(() => undefined),
        getFieldBitrixId: jest.fn(() => undefined),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: { api: { call } },
            PortalModel: portal,
        }),
    };
    const service = new CallReportDealVerifyService(pbxService as never);
    return { service, call };
};

/**
 * Приёмка 08.09.2026: у догадки агента проверялась только воронка, поэтому
 * сделка правильной воронки, но ЧУЖОЙ компании спокойно уезжала в карточку
 * разбора. Клиент звонка обязан сверяться наравне с воронкой.
 */
describe('CallReportDealVerifyService — воронка И клиент звонка', () => {
    afterEach(() => jest.clearAllMocks());

    it('сделка нужной воронки и той же компании — связь принимается', async () => {
        const { service } = makeDeps({
            '777': { ID: '777', CATEGORY_ID: '0', COMPANY_ID: '232232' },
        });

        const result = await service.filterAgentDeals(
            DOMAIN,
            { mainDealId: 777 },
            { companyId: 232232, contactId: 44 },
        );

        expect(result.mainDealId).toBe(777);
    });

    it('сделка нужной воронки, но ДРУГОЙ компании — связь отвергается', async () => {
        const { service } = makeDeps({
            '777': { ID: '777', CATEGORY_ID: '0', COMPANY_ID: '999' },
        });

        const result = await service.filterAgentDeals(
            DOMAIN,
            { mainDealId: 777 },
            { companyId: 232232 },
        );

        expect(result.mainDealId).toBeUndefined();
    });

    it('компания у сделки не совпала, но совпал КОНТАКТ звонка — принимается', async () => {
        const { service } = makeDeps({
            '777': {
                ID: '777',
                CATEGORY_ID: '0',
                COMPANY_ID: '0',
                CONTACT_ID: '44',
            },
        });

        const result = await service.filterAgentDeals(
            DOMAIN,
            { mainDealId: 777 },
            { companyId: 232232, contactId: 44 },
        );

        expect(result.mainDealId).toBe(777);
    });

    it('контакт звонка есть среди множественных CONTACT_IDS сделки', async () => {
        const { service } = makeDeps({
            '601': {
                ID: '601',
                CATEGORY_ID: '12',
                COMPANY_ID: '999',
                CONTACT_IDS: ['77', '44'],
            },
        });

        const result = await service.filterAgentDeals(
            DOMAIN,
            { presentationDealId: 601 },
            { companyId: 232232, contactId: 44 },
        );

        expect(result.presentationDealId).toBe(601);
    });

    it('сделка без клиента при известном клиенте звонка — отвергается', async () => {
        const { service } = makeDeps({
            '777': {
                ID: '777',
                CATEGORY_ID: '0',
                COMPANY_ID: '0',
                CONTACT_ID: '0',
            },
        });

        const result = await service.filterAgentDeals(
            DOMAIN,
            { mainDealId: 777 },
            { companyId: 232232, contactId: 44 },
        );

        expect(result.mainDealId).toBeUndefined();
    });

    it('клиент звонка неизвестен — сверять не с чем, решает воронка', async () => {
        const { service } = makeDeps({
            '777': { ID: '777', CATEGORY_ID: '0', COMPANY_ID: '999' },
        });

        const result = await service.filterAgentDeals(DOMAIN, {
            mainDealId: 777,
        });

        expect(result.mainDealId).toBe(777);
    });

    it('чужая воронка отвергается даже у своего клиента', async () => {
        const { service } = makeDeps({
            '777': { ID: '777', CATEGORY_ID: '28', COMPANY_ID: '232232' },
        });

        const result = await service.filterAgentDeals(
            DOMAIN,
            { mainDealId: 777 },
            { companyId: 232232 },
        );

        expect(result.mainDealId).toBeUndefined();
    });

    it('пустой вход — в Битрикс не ходим вовсе', async () => {
        const { service, call } = makeDeps({});

        const result = await service.filterAgentDeals(DOMAIN, {}, {});

        expect(result).toEqual({});
        expect(call).not.toHaveBeenCalled();
    });
});
