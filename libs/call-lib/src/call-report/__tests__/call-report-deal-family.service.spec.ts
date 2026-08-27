import { CallReportDealFamilyService } from '../services/call-report-deal-family.service';

const DOMAIN = 'alfacentr.bitrix24.ru';

/** Категории портала: основная / презентации / ХО. */
const CATEGORIES: Record<string, { bitrixId: number }> = {
    sales_base: { bitrixId: 0 },
    sales_presentation: { bitrixId: 12 },
    sales_xo: { bitrixId: 14 },
};

const makeDeps = (deal: Record<string, unknown> | null) => {
    const bitrix = {
        api: { call: jest.fn().mockResolvedValue({ result: deal }) },
    };
    const portal = {
        getDealCategoryByCode: jest.fn(
            (code: string) => CATEGORIES[code] ?? undefined,
        ),
        getEntityFieldByCode: jest.fn((_entity: string, code: string) =>
            code === 'to_base_sales' ? { code } : undefined,
        ),
        getFieldBitrixId: jest.fn(() => 'UF_CRM_TO_BASE_SALES'),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portal }),
    };
    const service = new CallReportDealFamilyService(pbxService as never);
    return { service, bitrix, portal };
};

describe('CallReportDealFamilyService', () => {
    it('звонок из сделки-презентации: основная берётся из «Корневой сделки Продажи»', async () => {
        const { service } = makeDeps({
            ID: '601',
            CATEGORY_ID: '12',
            UF_CRM_TO_BASE_SALES: ['D_555'],
        });

        const family = await service.resolve(DOMAIN, 601);

        expect(family).toEqual({
            mainDealId: 555,
            presentationDealId: 601,
        });
    });

    it('понимает и голый id в поле связи (формат поля с одной сущностью)', async () => {
        const { service } = makeDeps({
            ID: '601',
            CATEGORY_ID: '12',
            UF_CRM_TO_BASE_SALES: '555',
        });

        const family = await service.resolve(DOMAIN, 601);
        expect(family.mainDealId).toBe(555);
    });

    it('звонок из основной сделки: она сама и есть корневая', async () => {
        const { service } = makeDeps({ ID: '555', CATEGORY_ID: '0' });

        const family = await service.resolve(DOMAIN, 555);

        expect(family).toEqual({ mainDealId: 555 });
    });

    it('сделка ХО без корневой ссылки: основную НЕ выдумываем', async () => {
        const { service } = makeDeps({ ID: '602', CATEGORY_ID: '14' });

        const family = await service.resolve(DOMAIN, 602);

        expect(family).toEqual({ xoDealId: 602 });
        expect(family.mainDealId).toBeUndefined();
    });

    it('сделка не прочиталась — связь остаётся на самой сделке (fail-open)', async () => {
        const { service } = makeDeps(null);

        const family = await service.resolve(DOMAIN, 700);
        expect(family).toEqual({ mainDealId: 700 });
    });

    it('ошибка Битрикса не роняет конвейер', async () => {
        const { service, bitrix } = makeDeps({});
        bitrix.api.call.mockRejectedValue(new Error('ACCESS_DENIED'));

        const family = await service.resolve(DOMAIN, 700);
        expect(family).toEqual({ mainDealId: 700 });
    });

    it('звонок по лиду (без сделки) — раскладка пустая', async () => {
        const { service, bitrix } = makeDeps({});

        const family = await service.resolve(DOMAIN, undefined);

        expect(family).toEqual({});
        expect(bitrix.api.call).not.toHaveBeenCalled();
    });
});
