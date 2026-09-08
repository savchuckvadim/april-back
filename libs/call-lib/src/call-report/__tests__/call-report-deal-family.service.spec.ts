import { CallReportDealFamilyService } from '../services/call-report-deal-family.service';

const DOMAIN = 'alfacentr.bitrix24.ru';

/** Категории портала: основная / презентации / ХО (чужая воронка — 28). */
const CATEGORIES: Record<string, { bitrixId: number } | undefined> = {
    sales_base: { bitrixId: 0 },
    sales_presentation: { bitrixId: 12 },
    sales_xo: { bitrixId: 14 },
};

/** UF-ключи полей-ссылок сделки — как их отдаёт PortalModel. */
const FIELD_KEYS: Record<string, string> = {
    to_base_sales: 'UF_CRM_TO_BASE_SALES',
    to_presentation_sales: 'UF_CRM_TO_PRESENTATION_SALES',
    to_xo_sales: 'UF_CRM_TO_XO_SALES',
};

type Deal = Record<string, unknown>;

interface Options {
    /** Сделки портала по id — ответы `crm.deal.get`. */
    deals?: Record<string, Deal | null>;
    /** Ответы `crm.deal.list`: ключ — CATEGORY_ID из фильтра. */
    lists?: Record<string, Deal[]>;
    /** Справочник воронок портала (по умолчанию все три заведены). */
    categories?: Record<string, { bitrixId: number } | undefined>;
}

const makeDeps = (options: Options = {}) => {
    const deals = options.deals ?? {};
    const lists = options.lists ?? {};
    const listCalls: Record<string, unknown>[] = [];

    const call = jest.fn((method: string, data: Record<string, unknown>) => {
        if (method === 'crm.deal.get') {
            return Promise.resolve({
                result: deals[String(data.id)] ?? null,
            });
        }
        if (method === 'crm.deal.list') {
            listCalls.push(data);
            const filter = (data.filter ?? {}) as Record<string, unknown>;
            return Promise.resolve({
                result: lists[String(filter.CATEGORY_ID)] ?? [],
            });
        }
        return Promise.resolve({ result: null });
    });

    const categories = options.categories ?? CATEGORIES;
    const portal = {
        getDealCategoryByCode: jest.fn((code: string) => categories[code]),
        getEntityFieldByCode: jest.fn((_entity: string, code: string) =>
            FIELD_KEYS[code] ? { code } : undefined,
        ),
        getFieldBitrixId: jest.fn(
            (field: { code: string }) => FIELD_KEYS[field.code],
        ),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: { api: { call } },
            PortalModel: portal,
        }),
    };
    const service = new CallReportDealFamilyService(pbxService as never);
    return { service, call, portal, listCalls };
};

describe('CallReportDealFamilyService — «основная сделка» только воронки ОП', () => {
    it('звонок из основной сделки: она сама и есть корневая (ссылку не читаем)', async () => {
        const { service } = makeDeps({
            deals: { '555': { ID: '555', CATEGORY_ID: '0' } },
        });

        const family = await service.resolve(DOMAIN, 555);

        expect(family.mainDealId).toBe(555);
        expect(family.mainConfidence).toBe('exact');
        expect(family.ownerCategoryCode).toBe('sales_base');
    });

    it('звонок из сделки-презентации: основная берётся из «Корневой сделки Продажи»', async () => {
        const { service } = makeDeps({
            deals: {
                '601': {
                    ID: '601',
                    CATEGORY_ID: '12',
                    UF_CRM_TO_BASE_SALES: ['D_555'],
                },
                '555': { ID: '555', CATEGORY_ID: '0' },
            },
        });

        const family = await service.resolve(DOMAIN, 601);

        expect(family.mainDealId).toBe(555);
        expect(family.presentationDealId).toBe(601);
        expect(family.mainConfidence).toBe('exact');
    });

    it('понимает и голый id в поле связи (формат поля с одной сущностью)', async () => {
        const { service } = makeDeps({
            deals: {
                '601': {
                    ID: '601',
                    CATEGORY_ID: '12',
                    UF_CRM_TO_BASE_SALES: '555',
                },
                '555': { ID: '555', CATEGORY_ID: '0' },
            },
        });

        const family = await service.resolve(DOMAIN, 601);
        expect(family.mainDealId).toBe(555);
    });

    it('корневая ссылка на чужой префикс (контакт C_555) отвергается', async () => {
        const { service } = makeDeps({
            deals: {
                '601': {
                    ID: '601',
                    CATEGORY_ID: '12',
                    UF_CRM_TO_BASE_SALES: 'C_555',
                },
                '555': { ID: '555', CATEGORY_ID: '0' },
            },
        });

        const family = await service.resolve(DOMAIN, 601);

        expect(family.mainDealId).toBeUndefined();
        expect(family.presentationDealId).toBe(601);
    });

    it('корневая ссылка ведёт в ЧУЖУЮ воронку — отбрасывается, основная пустая', async () => {
        const { service } = makeDeps({
            deals: {
                '601': {
                    ID: '601',
                    CATEGORY_ID: '12',
                    UF_CRM_TO_BASE_SALES: ['D_900'],
                },
                '900': { ID: '900', CATEGORY_ID: '28' },
            },
        });

        const family = await service.resolve(DOMAIN, 601);

        expect(family.mainDealId).toBeUndefined();
        expect(family.presentationDealId).toBe(601);
    });

    it('сделка ЧУЖОЙ воронки в «основную сделку» не попадает', async () => {
        const { service } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
        });

        const family = await service.resolve(DOMAIN, 900);

        expect(family.mainDealId).toBeUndefined();
        expect(family.ownerCategoryCode).toBeUndefined();
    });

    it('сделка без CATEGORY_ID (воронку распознать нечем) в «основную» не попадает', async () => {
        const { service } = makeDeps({ deals: { '900': { ID: '900' } } });

        const family = await service.resolve(DOMAIN, 900);

        expect(family.mainDealId).toBeUndefined();
    });

    it('сделка не прочиталась (нет прав/удалена) — связей нет, конвейер жив', async () => {
        const { service } = makeDeps({ deals: { '700': null } });

        const family = await service.resolve(DOMAIN, 700);

        expect(family).toEqual({ unresolved: true });
    });

    it('ошибка Битрикса не роняет конвейер и НЕ подставляет сделку', async () => {
        const { service, call } = makeDeps();
        call.mockRejectedValue(new Error('ACCESS_DENIED'));

        const family = await service.resolve(DOMAIN, 700);

        expect(family).toEqual({ unresolved: true });
    });

    it('воронка «ОП Основная» не заведена на портале — связи не ставим вовсе', async () => {
        const { service, call } = makeDeps({
            categories: { sales_base: undefined },
            deals: { '555': { ID: '555', CATEGORY_ID: '0' } },
        });

        const family = await service.resolve(DOMAIN, 555);

        expect(family).toEqual({ unresolved: true });
        expect(call).not.toHaveBeenCalled();
    });

    it('пустой bitrixId воронки не совпадает с воронкой по умолчанию (CATEGORY_ID=0)', async () => {
        const { service } = makeDeps({
            categories: {
                sales_base: { bitrixId: 5 },
                sales_presentation: { bitrixId: '' as unknown as number },
                sales_xo: { bitrixId: 14 },
            },
            deals: { '700': { ID: '700', CATEGORY_ID: '0' } },
        });

        const family = await service.resolve(DOMAIN, 700);

        expect(family.presentationDealId).toBeUndefined();
        expect(family.mainDealId).toBeUndefined();
    });

    it('сделка ХО без корневой ссылки и без клиента: основную НЕ выдумываем', async () => {
        const { service } = makeDeps({
            deals: { '602': { ID: '602', CATEGORY_ID: '14' } },
        });

        const family = await service.resolve(DOMAIN, 602);

        expect(family.xoDealId).toBe(602);
        expect(family.mainDealId).toBeUndefined();
    });

    it('звонок по лиду без клиента — раскладка пустая, Битрикс не дёргаем', async () => {
        const { service, call } = makeDeps();

        const family = await service.resolve(DOMAIN, undefined);

        expect(family).toEqual({});
        expect(call).not.toHaveBeenCalled();
    });
});

describe('CallReportDealFamilyService — дотяжка по компании и контакту', () => {
    it('чужая воронка владельца: основная дотягивается по компании, ЗАКРЫТАЯ сделка находится', async () => {
        const { service } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
            lists: {
                '0': [
                    {
                        ID: '232',
                        CATEGORY_ID: '0',
                        STAGE_ID: 'APOLOGY',
                        CLOSED: 'Y',
                    },
                ],
            },
        });

        const family = await service.resolve(DOMAIN, 900, {
            companyId: 232232,
        });

        expect(family.mainDealId).toBe(232);
        expect(family.mainConfidence).toBe('likely');
    });

    it('поиск идёт БЕЗ фильтра по CLOSED и с фильтром воронки через PortalModel', async () => {
        const { service, listCalls } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
            lists: { '0': [{ ID: '232', CATEGORY_ID: '0', CLOSED: 'Y' }] },
        });

        await service.resolve(DOMAIN, 900, { companyId: 232232 });

        const filter = listCalls[0].filter as Record<string, unknown>;
        expect(filter.CATEGORY_ID).toBe('0');
        expect(filter.COMPANY_ID).toBe('232232');
        expect(filter).not.toHaveProperty('CLOSED');
        expect(filter).not.toHaveProperty('STAGE_ID');
    });

    it('несколько сделок — берём ближайшую к звонку с низкой уверенностью', async () => {
        const { service } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
            lists: {
                '0': [
                    {
                        ID: '10',
                        CATEGORY_ID: '0',
                        DATE_MODIFY: '2024-01-01T00:00:00+03:00',
                    },
                    {
                        ID: '20',
                        CATEGORY_ID: '0',
                        DATE_MODIFY: '2026-09-08T10:00:00+03:00',
                    },
                ],
            },
        });

        const family = await service.resolve(DOMAIN, 900, {
            companyId: 1,
            callStartedAt: new Date('2026-09-08T09:00:00+03:00'),
        });

        expect(family.mainDealId).toBe(20);
        expect(family.mainConfidence).toBe('guess');
    });

    it('звонок по лиду с известной компанией: основная дотягивается, сделку-владельца не читаем', async () => {
        const { service, call } = makeDeps({
            lists: { '0': [{ ID: '232', CATEGORY_ID: '0' }] },
        });

        const family = await service.resolve(DOMAIN, undefined, {
            contactId: 44,
        });

        expect(family.mainDealId).toBe(232);
        expect(call).not.toHaveBeenCalledWith(
            'crm.deal.get',
            expect.anything(),
        );
    });

    it('список вернул сделку чужой воронки — она отбрасывается, связь пустая', async () => {
        // Фильтр Битрикса по CATEGORY_ID — не доказательство: строку всё
        // равно сверяем с воронкой портала, иначе чужая сделка пролезет.
        const { service } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
            lists: { '0': [{ ID: '232', CATEGORY_ID: '28' }] },
        });

        const family = await service.resolve(DOMAIN, 900, { companyId: 5 });

        expect(family.mainDealId).toBeUndefined();
    });

    it('у клиента нет сделки основной воронки — связь остаётся пустой', async () => {
        const { service } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
            lists: {},
        });

        const family = await service.resolve(DOMAIN, 900, { companyId: 5 });

        expect(family.mainDealId).toBeUndefined();
        expect(family.mainConfidence).toBeUndefined();
    });
});

describe('CallReportDealFamilyService — дочерние сделки от корня', () => {
    it('звонок ИЗ основной сделки: презентационная берётся из прямого поля корня', async () => {
        const { service } = makeDeps({
            deals: {
                '555': {
                    ID: '555',
                    CATEGORY_ID: '0',
                    UF_CRM_TO_PRESENTATION_SALES: ['D_601'],
                },
                '601': { ID: '601', CATEGORY_ID: '12' },
            },
        });

        const family = await service.resolve(DOMAIN, 555);

        expect(family.mainDealId).toBe(555);
        expect(family.presentationDealId).toBe(601);
    });

    it('прямое поле корня пусто — презентационная ищется обратной ссылкой на корень', async () => {
        const { service, listCalls } = makeDeps({
            deals: { '555': { ID: '555', CATEGORY_ID: '0' } },
            lists: { '12': [{ ID: '601', CATEGORY_ID: '12' }] },
        });

        const family = await service.resolve(DOMAIN, 555);

        expect(family.presentationDealId).toBe(601);
        const filter = listCalls[0].filter as Record<string, unknown>;
        expect(filter.UF_CRM_TO_BASE_SALES).toEqual(['555', 'D_555']);
    });

    it('прямая ссылка корня ведёт в чужую воронку — отбрасывается', async () => {
        const { service } = makeDeps({
            deals: {
                '555': {
                    ID: '555',
                    CATEGORY_ID: '0',
                    UF_CRM_TO_PRESENTATION_SALES: ['D_900'],
                },
                '900': { ID: '900', CATEGORY_ID: '28' },
            },
            lists: {},
        });

        const family = await service.resolve(DOMAIN, 555);

        expect(family.presentationDealId).toBeUndefined();
    });

    it('дочерние доливаются и к сделке, дотянутой по клиенту', async () => {
        const { service } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
            lists: {
                '0': [{ ID: '232', CATEGORY_ID: '0' }],
                '12': [{ ID: '601', CATEGORY_ID: '12' }],
                '14': [{ ID: '602', CATEGORY_ID: '14' }],
            },
        });

        const family = await service.resolve(DOMAIN, 900, { companyId: 7 });

        expect(family.mainDealId).toBe(232);
        expect(family.presentationDealId).toBe(601);
        expect(family.xoDealId).toBe(602);
    });

    it('звонок из презентационной сделки: она остаётся презентацией, обратный поиск не нужен', async () => {
        const { service } = makeDeps({
            deals: {
                '601': {
                    ID: '601',
                    CATEGORY_ID: '12',
                    UF_CRM_TO_BASE_SALES: ['D_555'],
                },
                '555': { ID: '555', CATEGORY_ID: '0' },
            },
            lists: { '12': [{ ID: '777', CATEGORY_ID: '12' }] },
        });

        const family = await service.resolve(DOMAIN, 601);

        expect(family.presentationDealId).toBe(601);
        expect(family.presentationConfidence).toBe('exact');
    });
});
