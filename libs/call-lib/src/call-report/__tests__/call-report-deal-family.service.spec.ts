import { Logger } from '@nestjs/common';
import { CallReportDealFamilyService } from '../services/call-report-deal-family.service';
import {
    makeSalesList,
    SALES_CATEGORIES,
    SALES_LIST_IBLOCK,
    salesListFieldByCode,
    salesListItem,
} from './fixtures/sales-list.fixture';

const DOMAIN = 'alfacentr.bitrix24.ru';

/** Категории портала: основная / презентации / ХО (чужая воронка — 28). */
const CATEGORIES = SALES_CATEGORIES;

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
    /**
     * Элементы списка «ОП История» (шаг 0). По умолчанию списки в слепке
     * портала НЕ заведены — тогда работают прежние шаги 1–3.
     */
    history?: Record<string, unknown>[];
}

const makeDeps = (options: Options = {}) => {
    const deals = options.deals ?? {};
    const lists = options.lists ?? {};
    const listCalls: Record<string, unknown>[] = [];
    const salesLists: Record<string, ReturnType<typeof makeSalesList>> = {
        sales_kpi: makeSalesList('kpi'),
        sales_history: makeSalesList('history'),
    };
    /** lists.element.get: «ОП История» отдаёт элементы фикстуры, КПИ пуст. */
    const listItemGet = jest.fn((payload: Record<string, unknown>) =>
        Promise.resolve({
            result:
                String(payload.IBLOCK_ID) === SALES_LIST_IBLOCK.history
                    ? (options.history ?? [])
                    : [],
        }),
    );

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
        // Списки отчётности заведены только когда спек их задаёт: без них
        // читатель списков отдаёт пусто и шаг 0 ничего не находит.
        getListByCode: jest.fn((code: string) =>
            options.history ? salesLists[code] : undefined,
        ),
        getIdByCodeFieldList: jest.fn(salesListFieldByCode),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: { api: { call }, listItem: { get: listItemGet } },
            PortalModel: portal,
        }),
    };
    const service = new CallReportDealFamilyService(pbxService as never);
    return { service, call, portal, listCalls, listItemGet };
};

/** Фильтры дотяжки по клиенту — по ним проверяется, что её НЕ было. */
const clientLookupCalls = (listCalls: Record<string, unknown>[]) =>
    listCalls.filter(data => {
        const filter = (data.filter ?? {}) as Record<string, unknown>;
        return 'COMPANY_ID' in filter || 'CONTACT_ID' in filter;
    });

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

/**
 * §4 прод-фиксов: элемент «ОП История» этого звонка — ИСТОЧНИК ИСТИНЫ,
 * дотяжка по компании и контакту остаётся запасным путём.
 */
describe('CallReportDealFamilyService — шаг 0: семья из элемента «ОП История»', () => {
    const CALL_AT = new Date('2026-09-14T09:00:00Z');
    /** Контекст звонка из презентационной сделки 601 компании 232232. */
    const context = (overrides?: Record<string, unknown>) => ({
        companyId: 232232,
        contactId: 44,
        callStartedAt: CALL_AT,
        callerId: '622',
        callType: 'call',
        ...overrides,
    });

    it('запись с полной семьёй даёт точные связи БЕЗ дотяжки по клиенту', async () => {
        const { service, listCalls } = makeDeps({
            deals: {
                '601': { ID: '601', CATEGORY_ID: '12' },
                '175244': { ID: '175244', CATEGORY_ID: '0' },
            },
            // Дотяжка по компании нашла бы ДРУГУЮ сделку — она не должна
            // даже запрашиваться, пока запись списка отвечает.
            lists: { '0': [{ ID: '999', CATEGORY_ID: '0' }] },
            history: [
                salesListItem({
                    id: 9001,
                    crm: ['D_175244', 'D_601', 'CO_232232', 'C_44'],
                }),
            ],
        });

        const family = await service.resolve(DOMAIN, 601, context());

        expect(family.mainDealId).toBe(175244);
        expect(family.mainConfidence).toBe('exact');
        expect(family.source).toBe('list');
        expect(family.listRecordId).toBe('9001');
        expect(family.presentationDealId).toBe(601);
        expect(clientLookupCalls(listCalls)).toEqual([]);
    });

    it('повторный запрос того же звонка не идёт в портал заново', async () => {
        // За один разбор раскладку спрашивают трижды — из сборщика
        // контекста, из карточки разбора и из приёма анализа. Без короткой
        // памяти шаг 0 читал бы списки на каждый вызов: шесть лишних
        // обращений к порталу на звонок с заведомо одинаковым ответом.
        const { service, listCalls } = makeDeps({
            deals: {
                '601': { ID: '601', CATEGORY_ID: '12' },
                '175244': { ID: '175244', CATEGORY_ID: '0' },
            },
            history: [salesListItem({ id: 9001, crm: ['D_175244', 'D_601'] })],
        });

        const first = await service.resolve(DOMAIN, 601, context());
        const callsAfterFirst = listCalls.length;
        const second = await service.resolve(DOMAIN, 601, context());

        expect(second).toEqual(first);
        expect(listCalls.length).toBe(callsAfterFirst);
        // Другой звонок той же сделки — запись ищется заново.
        await service.resolve(
            DOMAIN,
            601,
            context({ callStartedAt: new Date('2026-09-14T10:00:00Z') }),
        );
        expect(listCalls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('звонок по ЛИДУ: основная сделка находится через запись списка', async () => {
        const { service, listCalls } = makeDeps({
            deals: { '175244': { ID: '175244', CATEGORY_ID: '0' } },
            lists: { '0': [{ ID: '999', CATEGORY_ID: '0' }] },
            history: [salesListItem({ id: 9002, crm: ['L_77', 'D_175244'] })],
        });

        const family = await service.resolve(DOMAIN, undefined, {
            leadId: 77,
            callStartedAt: CALL_AT,
        });

        expect(family.mainDealId).toBe(175244);
        expect(family.source).toBe('list');
        expect(clientLookupCalls(listCalls)).toEqual([]);
    });

    it('звонок по КОНТАКТУ без сделки: основная сделка тоже из записи', async () => {
        const { service } = makeDeps({
            deals: { '175244': { ID: '175244', CATEGORY_ID: '0' } },
            history: [salesListItem({ id: 9003, crm: ['C_44', 'D_175244'] })],
        });

        const family = await service.resolve(DOMAIN, undefined, {
            contactId: 44,
            callStartedAt: CALL_AT,
        });

        expect(family.mainDealId).toBe(175244);
        expect(family.source).toBe('list');
    });

    it('две сделки «ОП Основная» в элементе: связь пустая, дотяжки по клиенту НЕТ', async () => {
        const { service, listCalls } = makeDeps({
            deals: {
                '900': { ID: '900', CATEGORY_ID: '28' },
                '175244': { ID: '175244', CATEGORY_ID: '0' },
                '175300': { ID: '175300', CATEGORY_ID: '0' },
            },
            lists: { '0': [{ ID: '999', CATEGORY_ID: '0' }] },
            history: [
                salesListItem({
                    id: 9004,
                    crm: ['D_175244', 'D_175300', 'CO_232232'],
                }),
            ],
        });

        const family = await service.resolve(DOMAIN, 900, context());

        expect(family.mainDealId).toBeUndefined();
        expect(family.mainConfidence).toBeUndefined();
        expect(family.listConflicts).toEqual([
            { category: 'sales_base', dealIds: [175244, 175300] },
        ]);
        expect(clientLookupCalls(listCalls)).toEqual([]);
    });

    it('записи нет — работают запасные пути (дотяжка по компании)', async () => {
        const { service, listCalls } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
            lists: { '0': [{ ID: '232', CATEGORY_ID: '0' }] },
            history: [],
        });

        const family = await service.resolve(DOMAIN, 900, context());

        expect(family.mainDealId).toBe(232);
        expect(family.source).toBe('client-lookup');
        expect(family.listRecordId).toBeUndefined();
        expect(clientLookupCalls(listCalls)).toHaveLength(1);
    });

    it('crm-поле записи без сделок — деградация на запасные пути, без падения', async () => {
        const { service } = makeDeps({
            deals: { '900': { ID: '900', CATEGORY_ID: '28' } },
            lists: { '0': [{ ID: '232', CATEGORY_ID: '0' }] },
            history: [salesListItem({ id: 9005, crm: ['CO_232232'] })],
        });

        const family = await service.resolve(DOMAIN, 900, context());

        expect(family.listRecordId).toBe('9005');
        expect(family.mainDealId).toBe(232);
        expect(family.source).toBe('client-lookup');
        expect(family.mainConfidence).toBe('likely');
    });

    it('сделка-владелец сама в «ОП Основная» — она старше записи, расхождение в лог', async () => {
        const { service } = makeDeps({
            deals: {
                '555': { ID: '555', CATEGORY_ID: '0' },
                '175244': { ID: '175244', CATEGORY_ID: '0' },
            },
            history: [salesListItem({ id: 9006, crm: ['D_175244', 'D_555'] })],
        });

        const family = await service.resolve(DOMAIN, 555, context());

        // В элементе две сделки основной воронки — инвариант нарушен, из
        // записи связь не берётся; факт CRM (звонок сделан из 555) остаётся.
        expect(family.mainDealId).toBe(555);
        expect(family.source).toBe('root-link');
        expect(family.listConflicts).toHaveLength(1);
    });

    /**
     * Отступление от буквы §4, зафиксированное потоком: запись выбрана
     * РАНЖИРОВАНИЕМ (может описывать соседнее событие), а карточка, из
     * которой физически сделан звонок, — факт CRM. Поэтому владелец воронки
     * «ОП Основная» перекрывает связь записи, но расхождение обязано
     * попасть в лог, иначе подмена молчаливая.
     */
    it('владелец в «ОП Основная» перекрывает ОДНУ основную сделку записи — с предупреждением', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        try {
            const { service } = makeDeps({
                deals: {
                    '555': { ID: '555', CATEGORY_ID: '0' },
                    '175244': { ID: '175244', CATEGORY_ID: '0' },
                },
                // Запись найдена по КОМПАНИИ и указывает ДРУГУЮ основную
                // сделку: сделки-владельца 555 в её crm-поле нет.
                history: [
                    salesListItem({
                        id: 9008,
                        crm: ['D_175244', 'CO_232232'],
                    }),
                ],
            });

            const family = await service.resolve(DOMAIN, 555, context());

            expect(family.mainDealId).toBe(555);
            expect(family.source).toBe('root-link');
            expect(family.listRecordId).toBe('9008');
            expect(family.listConflicts).toBeUndefined();
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('175244'),
            );
        } finally {
            warn.mockRestore();
        }
    });

    it('без даты звонка запись не ищется вовсе (опознать «этот звонок» нечем)', async () => {
        const { service, listItemGet } = makeDeps({
            deals: { '555': { ID: '555', CATEGORY_ID: '0' } },
            history: [salesListItem({ id: 9007, crm: ['D_175244'] })],
        });

        const family = await service.resolve(DOMAIN, 555, { companyId: 1 });

        expect(family.mainDealId).toBe(555);
        expect(family.listRecordId).toBeUndefined();
        expect(listItemGet).not.toHaveBeenCalled();
    });
});
