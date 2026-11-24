import { Logger } from '@nestjs/common';
import { SALES_DOCUMENT_KIND, SalesDocumentEventJobData } from '@lib/queue';
import { EventDocumentPresentationListService } from '../services/kpi-list/event-document-presentation-list.service';
import {
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_CREATED_AT_MOSCOW,
    DOCUMENT_PRESENTATION_DEAL_ID,
    FakeBitrixOptions,
    FakeList,
    FakeListItem,
    PRESENTATION_IBLOCK_ID,
    PRESENTATION_LIST_KEYS,
    PRESENTATION_PROSPECTS_GOOD_ID,
    PRESENTATION_PROSPECTS_OTHER_ID,
    RecordedListUpdate,
    SnapshotOptions,
    makeContext,
    makeDocumentFields,
    makeFakeBitrix,
    makeFakeBuffer,
    makePresentationList,
} from './event-document.fixtures';

const { offer, invoice, contract } = SALES_DOCUMENT_KIND;

const KEYS = PRESENTATION_LIST_KEYS;
const OTHER_MULTIPLE_KEY = 'PROPERTY_305';
const OTHER_SINGLE_KEY = 'PROPERTY_306';

/** Поле-ссылка «сделка → основная сделка» на портале и его UF-ключ. */
const LINK_FIELD_BITRIX_ID = '1699';
const LINK_KEY = `UF_CRM_${LINK_FIELD_BITRIX_ID}`;

/** Код строки по умолчанию: основная сделка события и сделка презентации. */
const DEFAULT_ROW_CODE = `${DOCUMENT_BASE_DEAL_ID}_${DOCUMENT_PRESENTATION_DEAL_ID}`;
const DEFAULT_ROW_ID = 801;

const COMMENT_LINE_OFFER = `${DOCUMENT_CREATED_AT_MOSCOW} КП после презентации КП: 3 позиции`;

/** Строка списка «Презентации» в виде ответа `lists.element.get`. */
const makeRow = (code: string, id: number): FakeListItem => ({
    ID: String(id),
    CODE: code,
    NAME: 'Презентация ООО Ромашка',
    DATE_CREATE: '2026-11-20 10:00:00',
    [KEYS.sumOffer]: '1000',
    [KEYS.sumInvoice]: '2000',
    // Множественное свойство Битрикс отдаёт объектом «id значения → значение».
    [KEYS.doneComment]: { '11': 'Старый комментарий' },
    [KEYS.prospectsType]: PRESENTATION_PROSPECTS_OTHER_ID,
    [OTHER_MULTIPLE_KEY]: { '12': 'D_5000', '13': 'CO_700' },
    [OTHER_SINGLE_KEY]: 'Иванов',
});

const PRESENTATION_DEAL = {
    ID: String(DOCUMENT_PRESENTATION_DEAL_ID),
    CATEGORY_ID: '9',
};

interface RunOptions {
    event?: Partial<SalesDocumentEventJobData>;
    snapshot?: SnapshotOptions;
    lists?: Record<string, FakeList>;
    bitrix?: FakeBitrixOptions;
    /** Поле-ссылка на основную сделку установлено на портале. */
    withLinkField?: boolean;
}

const run = async ({
    event,
    snapshot,
    lists,
    bitrix,
    withLinkField = false,
}: RunOptions = {}) => {
    const fake = makeFakeBitrix([], {
        listItems: [
            {
                iblockId: PRESENTATION_IBLOCK_ID,
                item: makeRow(DEFAULT_ROW_CODE, DEFAULT_ROW_ID),
            },
        ],
        ...bitrix,
    });
    const { ctx, portal } = makeContext({
        event: {
            kinds: [offer],
            presentation: {},
            sum: 15000,
            summary: 'КП: 3 позиции',
            ...event,
        },
        snapshot: { presentationDeal: PRESENTATION_DEAL, ...snapshot },
        portal: {
            lists: lists ?? { sales_presentation: makePresentationList() },
            fields: withLinkField
                ? {
                      ...makeDocumentFields(),
                      to_base_sales: {
                          code: 'to_base_sales',
                          type: 'crm',
                          bitrixId: LINK_FIELD_BITRIX_ID,
                          items: [],
                      },
                  }
                : undefined,
        },
    });
    const buffer = makeFakeBuffer();

    await new EventDocumentPresentationListService(
        fake.bitrix as never,
        portal as never,
    ).queue(ctx, buffer);
    return { ...fake, buffer };
};

/** Единственная команда обновления строки; тест падает, если её нет. */
const onlyUpdate = (updates: RecordedListUpdate[]): RecordedListUpdate => {
    expect(updates).toHaveLength(1);
    return updates[0];
};

/**
 * Старый список «Презентации»: после КП или счёта «после презентации» в
 * строку презентации дописываются сумма и комментарий. Строку заводит
 * легаси-хук, новый бэк её только обновляет — и обновляет целиком, потому
 * что Битрикс стирает всё, что не передано.
 */
describe('EventDocumentPresentationListService — строка списка «Презентации»', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    // Нет повода писать — ничего не читаем и не пишем.
    describe('когда список не трогается', () => {
        it('документ не после презентации: ничего не читается и не пишется', async () => {
            const { listGets, listUpdates, buffer } = await run({
                event: { presentation: undefined },
            });

            expect(listGets).toEqual([]);
            expect(listUpdates).toEqual([]);
            expect(buffer.getCurrentGroupSize()).toBe(0);
        });

        it('договор после презентации (варианта «после презентации» у него нет): ничего не пишется', async () => {
            const { listGets, listUpdates } = await run({
                event: { kinds: [contract] },
            });

            expect(listGets).toEqual([]);
            expect(listUpdates).toEqual([]);
        });

        it('сделки презентации в снимке нет: ничего не пишется', async () => {
            const { listGets, listUpdates } = await run({
                snapshot: { presentationDeal: null },
            });

            expect(listGets).toEqual([]);
            expect(listUpdates).toEqual([]);
        });

        it('списка «Презентации» на портале нет: ничего не пишется, исключения нет', async () => {
            const { listGets, listUpdates } = await run({ lists: {} });

            expect(listGets).toEqual([]);
            expect(listUpdates).toEqual([]);
        });

        it.each([
            { name: 'пусто', listGetMissing: 'empty' as const },
            { name: 'ошибка', listGetMissing: 'throw' as const },
        ])(
            'строки презентации нет (ответ: $name): команды нет, исключения нет',
            async ({ listGetMissing }) => {
                const { listGets, listUpdates } = await run({
                    bitrix: { listItems: [], listGetMissing },
                });

                expect(listGets).toHaveLength(1);
                expect(listGets[0].ELEMENT_CODE).toBe(DEFAULT_ROW_CODE);
                expect(listUpdates).toEqual([]);
            },
        );
    });

    describe('КП после презентации, строка есть', () => {
        it('одна команда listItem.update с ключом doc_pres_list_row и id строки', async () => {
            const { listUpdates, buffer } = await run();

            const update = onlyUpdate(listUpdates);
            expect(update.cmd).toBe('doc_pres_list_row');
            expect(update.dto.IBLOCK_ID).toBe(String(PRESENTATION_IBLOCK_ID));
            expect(update.dto.ELEMENT_ID).toBe(DEFAULT_ROW_ID);
            expect(buffer.getCurrentGroupSize()).toBe(1);
        });

        it('строка читается по коду «основная_презентация» из своего списка', async () => {
            const { listGets } = await run();

            expect(listGets).toEqual([
                {
                    IBLOCK_ID: String(PRESENTATION_IBLOCK_ID),
                    ELEMENT_CODE: DEFAULT_ROW_CODE,
                },
            ]);
        });

        it('поля: название сохранено, прежние свойства переданы назад, сумма КП, комментарий и перспективность обновлены', async () => {
            const { listUpdates } = await run();

            expect(onlyUpdate(listUpdates).dto.FIELDS).toEqual({
                NAME: 'Презентация ООО Ромашка',
                // Новая сумма предложения — строкой.
                [KEYS.sumOffer]: '15000',
                // Сумма счёта не тронута: передана назад как была.
                [KEYS.sumInvoice]: ['2000'],
                // К уже имеющимся комментариям добавлена новая строка.
                [KEYS.doneComment]: ['Старый комментарий', COMMENT_LINE_OFFER],
                [KEYS.prospectsType]: PRESENTATION_PROSPECTS_GOOD_ID,
                // Чужие свойства: множественное — массивом значений.
                [OTHER_MULTIPLE_KEY]: ['D_5000', 'CO_700'],
                [OTHER_SINGLE_KEY]: ['Иванов'],
            });
        });

        it('служебные поля строки (ID, CODE, даты) назад не передаются', async () => {
            const { listUpdates } = await run();

            const keys = Object.keys(onlyUpdate(listUpdates).dto.FIELDS);
            expect(keys).not.toContain('ID');
            expect(keys).not.toContain('CODE');
            expect(keys).not.toContain('DATE_CREATE');
        });
    });

    describe('счёт и несколько документов', () => {
        it('счёт после презентации: пишется сумма счёта, сумма предложения остаётся прежней', async () => {
            const { listUpdates } = await run({
                event: { kinds: [invoice], sum: 7000 },
            });

            const fields = onlyUpdate(listUpdates).dto.FIELDS;
            expect(fields[KEYS.sumInvoice]).toBe('7000');
            expect(fields[KEYS.sumOffer]).toEqual(['1000']);
            expect(fields[KEYS.doneComment]).toEqual([
                'Старый комментарий',
                `${DOCUMENT_CREATED_AT_MOSCOW} Счет после презентации КП: 3 позиции`,
            ]);
        });

        it('КП со счётом: обе суммы обновляются, в комментарии оба документа', async () => {
            const { listUpdates } = await run({
                event: { kinds: [offer, invoice] },
            });

            const fields = onlyUpdate(listUpdates).dto.FIELDS;
            expect(fields[KEYS.sumOffer]).toBe('15000');
            expect(fields[KEYS.sumInvoice]).toBe('15000');
            expect(fields[KEYS.doneComment]).toEqual([
                'Старый комментарий',
                `${DOCUMENT_CREATED_AT_MOSCOW} КП после презентации, Счет после презентации КП: 3 позиции`,
            ]);
        });
    });

    describe('сумма и текст события', () => {
        // Ноль, минус и мусор — «пустая» сумма: настоящую она бы затёрла.
        it.each([undefined, 0, -100, NaN])(
            'сумма %s не передана: суммы не меняются, комментарий всё равно дописывается',
            async sum => {
                const { listUpdates } = await run({ event: { sum } });

                const fields = onlyUpdate(listUpdates).dto.FIELDS;
                expect(fields[KEYS.sumOffer]).toEqual(['1000']);
                expect(fields[KEYS.sumInvoice]).toEqual(['2000']);
                expect(fields[KEYS.doneComment]).toEqual([
                    'Старый комментарий',
                    COMMENT_LINE_OFFER,
                ]);
            },
        );

        it('текста события нет: в комментарии только дата и название документа', async () => {
            const { listUpdates } = await run({
                event: { summary: undefined },
            });

            expect(
                onlyUpdate(listUpdates).dto.FIELDS[KEYS.doneComment],
            ).toEqual([
                'Старый комментарий',
                `${DOCUMENT_CREATED_AT_MOSCOW} КП после презентации`,
            ]);
        });

        it('в строке нет прежних комментариев: комментарий — единственное значение', async () => {
            const row = makeRow(DEFAULT_ROW_CODE, DEFAULT_ROW_ID);
            delete row[KEYS.doneComment];

            const { listUpdates } = await run({
                bitrix: {
                    listItems: [
                        { iblockId: PRESENTATION_IBLOCK_ID, item: row },
                    ],
                },
            });

            expect(
                onlyUpdate(listUpdates).dto.FIELDS[KEYS.doneComment],
            ).toEqual([COMMENT_LINE_OFFER]);
        });
    });

    describe('код строки', () => {
        const OTHER_BASE_DEAL_ID = 4321;
        const LINKED_ROW_CODE = `${OTHER_BASE_DEAL_ID}_${DOCUMENT_PRESENTATION_DEAL_ID}`;
        const LINKED_ROW_ID = 802;

        const bothRows = (): FakeBitrixOptions => ({
            listItems: [
                {
                    iblockId: PRESENTATION_IBLOCK_ID,
                    item: makeRow(DEFAULT_ROW_CODE, DEFAULT_ROW_ID),
                },
                {
                    iblockId: PRESENTATION_IBLOCK_ID,
                    item: makeRow(LINKED_ROW_CODE, LINKED_ROW_ID),
                },
            ],
        });

        it('берётся по основной сделке САМОЙ презентации, а не по основной сделке события', async () => {
            const { listGets, listUpdates } = await run({
                withLinkField: true,
                snapshot: {
                    presentationDeal: {
                        ...PRESENTATION_DEAL,
                        [LINK_KEY]: String(OTHER_BASE_DEAL_ID),
                    },
                },
                bitrix: bothRows(),
            });

            expect(listGets[0].ELEMENT_CODE).toBe(LINKED_ROW_CODE);
            expect(onlyUpdate(listUpdates).dto.ELEMENT_ID).toBe(LINKED_ROW_ID);
        });

        it.each(['', '0', 'нет'])(
            'ссылка на основную сделку в презентации пуста или мусор («%s»): код по основной сделке события',
            async link => {
                const { listGets, listUpdates } = await run({
                    withLinkField: true,
                    snapshot: {
                        presentationDeal: {
                            ...PRESENTATION_DEAL,
                            [LINK_KEY]: link,
                        },
                    },
                    bitrix: bothRows(),
                });

                expect(listGets[0].ELEMENT_CODE).toBe(DEFAULT_ROW_CODE);
                expect(onlyUpdate(listUpdates).dto.ELEMENT_ID).toBe(
                    DEFAULT_ROW_ID,
                );
            },
        );
    });

    describe('поле не установлено в списке', () => {
        it('нет полей комментария и перспективности: строка уходит без них, прежние значения на месте', async () => {
            const { listUpdates } = await run({
                lists: {
                    sales_presentation: makePresentationList([
                        'pres_done_comment',
                        'pres_prospects_type',
                    ]),
                },
            });

            const fields = onlyUpdate(listUpdates).dto.FIELDS;
            expect(fields[KEYS.doneComment]).toEqual(['Старый комментарий']);
            expect(fields[KEYS.prospectsType]).toEqual([
                PRESENTATION_PROSPECTS_OTHER_ID,
            ]);
            expect(fields[KEYS.sumOffer]).toBe('15000');
        });

        it('нет полей сумм: суммы не пишутся, остальное обновляется', async () => {
            const { listUpdates } = await run({
                lists: {
                    sales_presentation: makePresentationList([
                        'pres_sum_offer',
                        'pres_sum_invoice',
                    ]),
                },
            });

            const fields = onlyUpdate(listUpdates).dto.FIELDS;
            expect(fields[KEYS.sumOffer]).toEqual(['1000']);
            expect(fields[KEYS.sumInvoice]).toEqual(['2000']);
            expect(fields[KEYS.prospectsType]).toBe(
                PRESENTATION_PROSPECTS_GOOD_ID,
            );
        });
    });
});
