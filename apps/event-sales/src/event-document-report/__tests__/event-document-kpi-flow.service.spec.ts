import { Logger } from '@nestjs/common';
import { SALES_DOCUMENT_KIND, SalesDocumentEventJobData } from '@lib/queue';
import { EventDocumentKpiFlowService } from '../services/kpi-list/event-document-kpi-flow.service';
import {
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_COMPANY_ID,
    DOCUMENT_PRESENTATION_DEAL_ID,
    FakeBitrixOptions,
    FakeList,
    KPI_IBLOCK_ID,
    HISTORY_IBLOCK_ID,
    kpiEventTypeItemId,
    kpiIblockId,
    listFieldKey,
    makeContext,
    makeFakeBitrix,
    makeFakeBuffer,
    makeSalesLists,
    RecordedListAdd,
} from './event-document.fixtures';

const { offer, invoice, contract, supply } = SALES_DOCUMENT_KIND;

const KEY_PREFIX = `${DOCUMENT_COMPANY_ID}_${DOCUMENT_BASE_DEAL_ID}`;
const OFFER_CODE = `${KEY_PREFIX}_ev_offer`;
const OFFER_PRES_CODE = `${KEY_PREFIX}_ev_offer_pres`;

interface RunOptions {
    event?: Partial<SalesDocumentEventJobData>;
    /** Списки портала; по умолчанию — «ОП KPI» и «ОП История». */
    lists?: Record<string, FakeList>;
    bitrix?: FakeBitrixOptions;
}

const run = async ({ event, lists, bitrix }: RunOptions = {}) => {
    const fake = makeFakeBitrix([], bitrix);
    const { ctx, portal } = makeContext({
        event,
        snapshot: {
            presentationDeal: { ID: String(DOCUMENT_PRESENTATION_DEAL_ID) },
        },
        portal: { lists: lists ?? makeSalesLists() },
    });

    await new EventDocumentKpiFlowService(
        fake.bitrix as never,
        portal as never,
    ).queue(ctx, makeFakeBuffer());
    return fake;
};

/** Строка уже лежит в «ОП KPI» с этим кодом. */
const existingKpiRow = (code: string): FakeBitrixOptions => ({
    listItems: [{ iblockId: KPI_IBLOCK_ID, item: { ID: 901, CODE: code } }],
});

const addsTo = (adds: RecordedListAdd[], iblockId: string): RecordedListAdd[] =>
    adds.filter(add => add.dto.IBLOCK_ID === iblockId);

/**
 * Документы пишутся в два списка по разным правилам: в «ОП История» каждый
 * документ виден отдельной строкой, в «ОП KPI» тип документа засчитывается
 * один раз на пару «компания + основная сделка» — повтор уже существующую
 * строку не трогает.
 */
describe('EventDocumentKpiFlowService — запись документов в списки', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    describe('первое КП по сделке', () => {
        it('две команды добавления: одна в историю, одна в KPI', async () => {
            const { listAdds, listUpdates } = await run();

            expect(listAdds).toHaveLength(2);
            expect(listUpdates).toEqual([]);
            expect(addsTo(listAdds, kpiIblockId('history'))).toHaveLength(1);
            expect(addsTo(listAdds, kpiIblockId('kpi'))).toHaveLength(1);
        });

        it('строка истории: код элемента начинается с history_<компания>_', async () => {
            const { listAdds } = await run();

            const [history] = addsTo(listAdds, kpiIblockId('history'));
            expect(history.dto.ELEMENT_CODE).toMatch(
                new RegExp(`^history_${DOCUMENT_COMPANY_ID}_`),
            );
            expect(history.cmd).toMatch(/^add_list_item_history_/);
            expect(history.dto.FIELDS.NAME).toBe('КП');
        });

        it('строка KPI: код элемента — «компания_сделка_тип», как у легаси', async () => {
            const { listAdds } = await run();

            const [kpi] = addsTo(listAdds, kpiIblockId('kpi'));
            expect(kpi.dto.ELEMENT_CODE).toBe(OFFER_CODE);
            expect(kpi.dto.FIELDS.NAME).toBe('КП');
            expect(kpi.dto.FIELDS[listFieldKey('kpi', 'event_type')]).toBe(
                kpiEventTypeItemId('ev_offer'),
            );
        });

        it('наличие строки KPI проверяется чтением по её коду', async () => {
            const { listGets } = await run();

            expect(listGets).toEqual([
                expect.objectContaining({
                    IBLOCK_ID: kpiIblockId('kpi'),
                    ELEMENT_CODE: OFFER_CODE,
                }),
            ]);
        });
    });

    describe('повторное КП по той же сделке', () => {
        it('в KPI команды нет — строка уже засчитана и не меняется', async () => {
            const { listAdds, listUpdates } = await run({
                bitrix: existingKpiRow(OFFER_CODE),
            });

            expect(addsTo(listAdds, kpiIblockId('kpi'))).toEqual([]);
            expect(listUpdates).toEqual([]);
        });

        it('в историю строка добавляется снова', async () => {
            const { listAdds } = await run({
                bitrix: existingKpiRow(OFFER_CODE),
            });

            expect(listAdds).toHaveLength(1);
            expect(listAdds[0].dto.IBLOCK_ID).toBe(kpiIblockId('history'));
        });

        it('чтение строки упало — документ не теряется: строка KPI добавляется', async () => {
            const { listAdds } = await run({
                bitrix: { listGetMissing: 'throw' },
            });

            expect(addsTo(listAdds, kpiIblockId('kpi'))).toHaveLength(1);
        });
    });

    describe('после презентации', () => {
        it('в KPI две строки — «КП» и «КП после презентации», в историю одна', async () => {
            const { listAdds } = await run({ event: { presentation: {} } });

            const kpi = addsTo(listAdds, kpiIblockId('kpi'));
            expect(kpi.map(add => add.dto.ELEMENT_CODE)).toEqual([
                OFFER_CODE,
                OFFER_PRES_CODE,
            ]);
            expect(kpi.map(add => add.dto.FIELDS.NAME)).toEqual([
                'КП',
                'КП после презентации',
            ]);
            expect(addsTo(listAdds, kpiIblockId('history'))).toHaveLength(1);
        });

        it('строка «после презентации» несёт свой тип события', async () => {
            const { listAdds } = await run({ event: { presentation: {} } });

            const [, pres] = addsTo(listAdds, kpiIblockId('kpi'));
            expect(pres.dto.FIELDS[listFieldKey('kpi', 'event_type')]).toBe(
                kpiEventTypeItemId('ev_offer_pres'),
            );
        });

        it('«КП» уже засчитано, «после презентации» ещё нет — добавляется только вторая строка', async () => {
            const { listAdds } = await run({
                event: { presentation: {} },
                bitrix: existingKpiRow(OFFER_CODE),
            });

            expect(
                addsTo(listAdds, kpiIblockId('kpi')).map(
                    add => add.dto.ELEMENT_CODE,
                ),
            ).toEqual([OFFER_PRES_CODE]);
        });
    });

    describe('несколько документов и другие виды', () => {
        it('КП со счётом: по две строки в историю и в KPI', async () => {
            const { listAdds } = await run({
                event: { kinds: [offer, invoice] },
            });

            expect(addsTo(listAdds, kpiIblockId('history'))).toHaveLength(2);
            expect(
                addsTo(listAdds, kpiIblockId('kpi')).map(
                    add => add.dto.ELEMENT_CODE,
                ),
            ).toEqual([OFFER_CODE, `${KEY_PREFIX}_ev_invoice`]);
        });

        it.each([
            { name: 'договор', kind: contract, type: 'ev_contract' },
            { name: 'отчёт о поставке', kind: supply, type: 'ev_supply' },
        ])(
            '$name: строка KPI с кодом «компания_сделка_$type»',
            async ({ kind, type }) => {
                const { listAdds } = await run({ event: { kinds: [kind] } });

                expect(
                    addsTo(listAdds, kpiIblockId('kpi')).map(
                        add => add.dto.ELEMENT_CODE,
                    ),
                ).toEqual([`${KEY_PREFIX}_${type}`]);
            },
        );
    });

    describe('мягкий пропуск', () => {
        it('варианта ev_contract на портале нет: строка KPI договора не создаётся, исключения нет', async () => {
            const { listAdds, listGets } = await run({
                event: { kinds: [contract] },
                lists: makeSalesLists({ missingEventTypes: ['ev_contract'] }),
            });

            expect(addsTo(listAdds, kpiIblockId('kpi'))).toEqual([]);
            // Без типа строка KPI — мусор: пропуск до чтения, без запросов.
            expect(listGets).toEqual([]);
        });

        it('отсутствие одного варианта не мешает остальным документам события', async () => {
            const { listAdds } = await run({
                event: { kinds: [offer, contract] },
                lists: makeSalesLists({ missingEventTypes: ['ev_contract'] }),
            });

            expect(
                addsTo(listAdds, kpiIblockId('kpi')).map(
                    add => add.dto.ELEMENT_CODE,
                ),
            ).toEqual([OFFER_CODE]);
        });

        it('списков «ОП KPI» и «ОП История» на портале нет: команд нет, исключения нет', async () => {
            const { listAdds, listUpdates, listGets } = await run({
                lists: {},
            });

            expect(listAdds).toEqual([]);
            expect(listUpdates).toEqual([]);
            expect(listGets).toEqual([]);
        });

        it('списка истории на портале нет: пишется только KPI', async () => {
            const { sales_kpi: kpi } = makeSalesLists();

            const { listAdds } = await run({ lists: { sales_kpi: kpi } });

            expect(listAdds).toHaveLength(1);
            expect(listAdds[0].dto.IBLOCK_ID).toBe(String(KPI_IBLOCK_ID));
            expect(addsTo(listAdds, String(HISTORY_IBLOCK_ID))).toEqual([]);
        });
    });
});
