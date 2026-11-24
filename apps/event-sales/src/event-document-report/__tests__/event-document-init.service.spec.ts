import { SalesDocumentEventJobData } from '@lib/queue';
import { EventDocumentInitService } from '../services/init/event-document-init.service';
import {
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_COMPANY_ID,
    DOCUMENT_DOMAIN,
    FakePortalOptions,
    PRESENTATION_CATEGORY_BITRIX_ID,
    makeBaseCategory,
    makeDocumentFields,
    makeEvent,
    makeFakeBitrix,
    makeFakePortal,
} from './event-document.fixtures';

const COMPANY = { ID: String(DOCUMENT_COMPANY_ID) };
const BASE_DEAL = { ID: String(DOCUMENT_BASE_DEAL_ID) };

/** Поле-ссылка «сделка → основная сделка» на портале и его UF-ключ. */
const LINK_FIELD_BITRIX_ID = '1699';
const LINK_FIELD_KEY = `UF_CRM_${LINK_FIELD_BITRIX_ID}`;

const portalWithLinkField = (over: FakePortalOptions = {}) =>
    makeFakePortal({
        fields: {
            ...makeDocumentFields(),
            to_base_sales: {
                code: 'to_base_sales',
                type: 'crm',
                bitrixId: LINK_FIELD_BITRIX_ID,
                items: [],
            },
        },
        ...over,
    });

const load = (
    batchChunks: readonly Record<string, unknown>[],
    event: Partial<SalesDocumentEventJobData> = {},
    portalOptions: FakePortalOptions = {},
) => {
    const fake = makeFakeBitrix(batchChunks);
    const portal = portalWithLinkField(portalOptions);
    const snapshot = new EventDocumentInitService().loadSnapshot(
        makeEvent(event),
        fake.bitrix as never,
        portal as never,
    );
    return { ...fake, snapshot };
};

/**
 * Снимок карточек читается одной пачкой в момент события, внутри слота
 * клиента: счётчики документов считаются как «значение из снимка + 1», и
 * устаревший снимок дал бы неверные числа. Основная сделка обязательна —
 * без неё документу нечего двигать.
 */
describe('EventDocumentInitService — чтение карточек для потока документов', () => {
    // Обычный документ читает только компанию и основную сделку, одной пачкой.
    describe('документ не «после презентации»', () => {
        it('в пачке две команды чтения — компания и основная сделка', async () => {
            const { commands, companyGets, dealGets, dealLists, snapshot } =
                load([{ get_company: COMPANY, get_base_deal: BASE_DEAL }]);

            await snapshot;

            expect(commands).toEqual(['get_company', 'get_base_deal']);
            expect(companyGets).toEqual([
                { cmd: 'get_company', id: DOCUMENT_COMPANY_ID },
            ]);
            expect(dealGets).toEqual([
                { cmd: 'get_base_deal', id: DOCUMENT_BASE_DEAL_ID },
            ]);
            expect(dealLists).toEqual([]);
        });

        it('снимок: компания и основная сделка, сделки презентации нет', async () => {
            const { snapshot } = load([
                { get_company: COMPANY, get_base_deal: BASE_DEAL },
            ]);

            await expect(snapshot).resolves.toEqual({
                company: COMPANY,
                baseDeal: BASE_DEAL,
                presentationDeal: null,
            });
        });

        it('пачка читается одним вызовом со строгим режимом', async () => {
            const { callBatchWithConcurrency, snapshot } = load([
                { get_company: COMPANY, get_base_deal: BASE_DEAL },
            ]);

            await snapshot;

            expect(callBatchWithConcurrency).toHaveBeenCalledTimes(1);
            expect(callBatchWithConcurrency).toHaveBeenCalledWith(1, {
                strict: true,
            });
        });

        it('ответ из нескольких кусков пачки склеивается', async () => {
            const { snapshot } = load([
                { get_company: COMPANY },
                { get_base_deal: BASE_DEAL },
            ]);

            await expect(snapshot).resolves.toMatchObject({
                company: COMPANY,
                baseDeal: BASE_DEAL,
            });
        });
    });

    // Сделка презентации известна — читаем её по id, без поиска.
    describe('после презентации с известной сделкой', () => {
        const PRESENTATION_DEAL = {
            ID: '77',
            CATEGORY_ID: PRESENTATION_CATEGORY_BITRIX_ID,
            COMPANY_ID: String(DOCUMENT_COMPANY_ID),
        };

        // Чужая сделка: счётчики и товары документа не должны уйти в
        // карточку другого клиента или в сделку не той воронки.
        it.each([
            ['сделка другой компании', { COMPANY_ID: '999' }],
            ['сделка не из воронки презентаций', { CATEGORY_ID: '7' }],
        ])('%s — в снимок не попадает', async (_title, over) => {
            const { snapshot } = load(
                [
                    {
                        get_company: COMPANY,
                        get_base_deal: BASE_DEAL,
                        get_pres_deal: { ...PRESENTATION_DEAL, ...over },
                    },
                ],
                { presentation: { dealId: 77 } },
            );

            await expect(snapshot).resolves.toMatchObject({
                presentationDeal: null,
            });
        });

        it('добавляется чтение сделки презентации по её id', async () => {
            const { commands, dealGets, snapshot } = load(
                [
                    {
                        get_company: COMPANY,
                        get_base_deal: BASE_DEAL,
                        get_pres_deal: PRESENTATION_DEAL,
                    },
                ],
                { presentation: { dealId: 77 } },
            );

            await snapshot;

            expect(commands).toEqual([
                'get_company',
                'get_base_deal',
                'get_pres_deal',
            ]);
            expect(dealGets).toContainEqual({ cmd: 'get_pres_deal', id: 77 });
        });

        it('сделка попадает в снимок', async () => {
            const { snapshot } = load(
                [
                    {
                        get_company: COMPANY,
                        get_base_deal: BASE_DEAL,
                        get_pres_deal: PRESENTATION_DEAL,
                    },
                ],
                { presentation: { dealId: 77 } },
            );

            await expect(snapshot).resolves.toMatchObject({
                presentationDeal: PRESENTATION_DEAL,
            });
        });

        it('сделку поиском не ищем — id уже известен', async () => {
            const { dealLists, snapshot } = load(
                [{ get_company: COMPANY, get_base_deal: BASE_DEAL }],
                { presentation: { dealId: 77 } },
            );

            await snapshot;

            expect(dealLists).toEqual([]);
        });

        it('сделка презентации не найдена — в снимке null, исключения нет', async () => {
            const { snapshot } = load(
                [{ get_company: COMPANY, get_base_deal: BASE_DEAL }],
                { presentation: { dealId: 77 } },
            );

            await expect(snapshot).resolves.toMatchObject({
                presentationDeal: null,
            });
        });
    });

    // Сделка не указана — ищем презентации основной сделки, берём свежую.
    describe('после презентации без указанной сделки', () => {
        it('добавляется поиск презентаций основной сделки в воронке «Презентации»', async () => {
            const { commands, dealLists, snapshot } = load(
                [{ get_company: COMPANY, get_base_deal: BASE_DEAL }],
                { presentation: {} },
            );

            await snapshot;

            expect(commands).toEqual([
                'get_company',
                'get_base_deal',
                'list_pres_deals',
            ]);
            expect(dealLists).toHaveLength(1);
            expect(dealLists[0].cmd).toBe('list_pres_deals');
            expect(dealLists[0].filter).toEqual({
                CATEGORY_ID: PRESENTATION_CATEGORY_BITRIX_ID,
                [LINK_FIELD_KEY]: DOCUMENT_BASE_DEAL_ID,
            });
        });

        it('поиск просит пользовательские поля: без них счётчики не прочитать', async () => {
            const { dealLists, snapshot } = load(
                [{ get_company: COMPANY, get_base_deal: BASE_DEAL }],
                { presentation: {} },
            );

            await snapshot;

            expect(dealLists[0].select).toEqual(['*', 'UF_*']);
        });

        it('ключ ссылки на основную сделку — запасной, если поля нет на портале', async () => {
            const { dealLists, snapshot } = load(
                [{ get_company: COMPANY, get_base_deal: BASE_DEAL }],
                { presentation: {} },
                { fields: makeDocumentFields() },
            );

            await snapshot;

            expect(dealLists[0].filter).toHaveProperty(
                'UF_CRM_TO_BASE_SALES',
                DOCUMENT_BASE_DEAL_ID,
            );
        });

        it('из нескольких найденных берётся сделка с наибольшим ID', async () => {
            const { snapshot } = load(
                [
                    {
                        get_company: COMPANY,
                        get_base_deal: BASE_DEAL,
                        list_pres_deals: [
                            { ID: '9' },
                            { ID: '100' },
                            { ID: '88' },
                        ],
                    },
                ],
                { presentation: {} },
            );

            // Числовое сравнение: строка «9» больше строки «100».
            await expect(snapshot).resolves.toMatchObject({
                presentationDeal: { ID: '100' },
            });
        });

        it('презентаций нет — в снимке null', async () => {
            const { snapshot } = load(
                [
                    {
                        get_company: COMPANY,
                        get_base_deal: BASE_DEAL,
                        list_pres_deals: [],
                    },
                ],
                { presentation: {} },
            );

            await expect(snapshot).resolves.toMatchObject({
                presentationDeal: null,
            });
        });

        it('в блоке только элемент смарта — тоже ищем по основной сделке', async () => {
            const { dealLists, snapshot } = load(
                [{ get_company: COMPANY, get_base_deal: BASE_DEAL }],
                { presentation: { smartItemId: 12 } },
            );

            await snapshot;

            expect(dealLists).toHaveLength(1);
        });

        it('воронки «Презентации» нет на портале — поиска нет, снимок без презентации', async () => {
            const { commands, snapshot } = load(
                [{ get_company: COMPANY, get_base_deal: BASE_DEAL }],
                { presentation: {} },
                { categories: [makeBaseCategory()] },
            );

            await expect(snapshot).resolves.toMatchObject({
                presentationDeal: null,
            });
            expect(commands).toEqual(['get_company', 'get_base_deal']);
        });
    });

    // Без основной сделки поток не идёт; без компании — идёт, но без её полей.
    describe('чего не хватает в ответе', () => {
        it('основная сделка не найдена — исключение с id сделки и доменом', async () => {
            const { snapshot } = load([{ get_company: COMPANY }]);

            await expect(snapshot).rejects.toThrow(
                String(DOCUMENT_BASE_DEAL_ID),
            );
            await expect(snapshot).rejects.toThrow(DOCUMENT_DOMAIN);
        });

        it('основная сделка пришла без ID — тоже исключение', async () => {
            const { snapshot } = load([
                { get_company: COMPANY, get_base_deal: {} },
            ]);

            await expect(snapshot).rejects.toThrow(
                String(DOCUMENT_BASE_DEAL_ID),
            );
        });

        it('основная сделка пришла пустым значением — исключение', async () => {
            const { snapshot } = load([
                { get_company: COMPANY, get_base_deal: null },
            ]);

            await expect(snapshot).rejects.toThrow(
                String(DOCUMENT_BASE_DEAL_ID),
            );
        });

        it('компания не прочитана — в снимке null, исключения нет', async () => {
            const { snapshot } = load([{ get_base_deal: BASE_DEAL }]);

            await expect(snapshot).resolves.toEqual({
                company: null,
                baseDeal: BASE_DEAL,
                presentationDeal: null,
            });
        });
    });
});
