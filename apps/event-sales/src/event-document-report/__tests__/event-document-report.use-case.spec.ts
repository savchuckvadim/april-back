import { Logger } from '@nestjs/common';
import { SALES_DOCUMENT_KIND } from '@lib/queue';
import { EventDocumentWriteError } from '../lib/event-document-write.error';
import { EventDocumentInitService } from '../services/init/event-document-init.service';
import { EventDocumentReportUseCase } from '../use-cases/event-document-report.use-case';
import {
    BASE_CATEGORY_BITRIX_ID,
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_COMPANY_ID,
    DOCUMENT_DOMAIN,
    DOCUMENT_PRESENTATION_DEAL_ID,
    FakeBitrixOptions,
    FakeList,
    PRESENTATION_CATEGORY_BITRIX_ID,
    PRESENTATION_IBLOCK_ID,
    baseStageId,
    makeEvent,
    makeFakeBitrix,
    makeFakePortal,
    makePresentationList,
    makeSalesLists,
} from './event-document.fixtures';

const { offer } = SALES_DOCUMENT_KIND;

/** Ответ читающей пачки: компания и основная сделка на «Тёплой». */
const READ_RESULT: Record<string, unknown> = {
    get_company: { ID: String(DOCUMENT_COMPANY_ID) },
    get_base_deal: {
        ID: String(DOCUMENT_BASE_DEAL_ID),
        CATEGORY_ID: BASE_CATEGORY_BITRIX_ID,
        STAGE_ID: baseStageId('sales_warm'),
    },
};

interface HarnessOptions {
    /** Что вернёт чтение; по умолчанию — компания и основная сделка. */
    readResult?: Record<string, unknown>;
    lists?: Record<string, FakeList>;
    bitrix?: FakeBitrixOptions;
}

const makeHarness = ({
    readResult = READ_RESULT,
    lists,
    bitrix,
}: HarnessOptions = {}) => {
    const fake = makeFakeBitrix([readResult], bitrix);
    const portal = makeFakePortal({ lists: lists ?? makeSalesLists() });
    const init = jest
        .fn<Promise<{ bitrix: unknown; PortalModel: unknown }>, [string]>()
        .mockResolvedValue({ bitrix: fake.bitrix, PortalModel: portal });
    const useCase = new EventDocumentReportUseCase(
        { init } as never,
        new EventDocumentInitService(),
    );
    return { useCase, init, ...fake };
};

/** Ничего не записано ни в одну карточку и ни в один список. */
const expectNothingWritten = (
    harness: Pick<
        ReturnType<typeof makeHarness>,
        | 'companyUpdates'
        | 'dealUpdates'
        | 'productRowSets'
        | 'listAdds'
        | 'listUpdates'
    >,
): void => {
    expect(harness.companyUpdates).toEqual([]);
    expect(harness.dealUpdates).toEqual([]);
    expect(harness.productRowSets).toEqual([]);
    expect(harness.listAdds).toEqual([]);
    expect(harness.listUpdates).toEqual([]);
};

/**
 * Поток документов целиком: портал → одно чтение пачкой → сервисы копят
 * команды → одна пачка на запись. Сбой на записи отличается от сбоя на
 * чтении: часть команд могла выполниться, и повторять событие нельзя.
 */
describe('EventDocumentReportUseCase — событие «документ сформирован»', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    describe('событие без документов', () => {
        it('портал не инициализируется, Битрикс не вызывается, команд ноль', async () => {
            const harness = makeHarness();

            const result = await harness.useCase.execute(
                makeEvent({ kinds: [] }),
            );

            expect(result).toEqual({ commands: 0 });
            expect(harness.init).not.toHaveBeenCalled();
            expect(harness.callBatchWithConcurrency).not.toHaveBeenCalled();
        });
    });

    describe('КП', () => {
        it('портал берётся по домену события, возвращается число команд записывающей пачки', async () => {
            const harness = makeHarness();

            const result = await harness.useCase.execute(makeEvent());

            expect(harness.init).toHaveBeenCalledTimes(1);
            expect(harness.init).toHaveBeenCalledWith(DOCUMENT_DOMAIN);
            // Компания, основная сделка, строка истории и строка KPI.
            expect(result.commands).toBeGreaterThan(0);
            expect(result).toEqual({ commands: 4 });
        });

        it('Битрикс вызывается дважды — чтение и запись, оба в строгом режиме', async () => {
            const harness = makeHarness();

            await harness.useCase.execute(makeEvent());

            expect(harness.callBatchWithConcurrency).toHaveBeenCalledTimes(2);
            expect(harness.callBatchWithConcurrency).toHaveBeenNthCalledWith(
                1,
                1,
                { strict: true },
            );
            expect(harness.callBatchWithConcurrency).toHaveBeenNthCalledWith(
                2,
                1,
                { strict: true },
            );
        });

        it('читается компания и основная сделка, пишутся карточки и оба списка', async () => {
            const harness = makeHarness();

            await harness.useCase.execute(makeEvent());

            expect(harness.commands).toEqual(['get_company', 'get_base_deal']);
            expect(harness.companyUpdates.map(update => update.cmd)).toEqual([
                'doc_company',
            ]);
            expect(harness.dealUpdates.map(update => update.cmd)).toEqual([
                'doc_base_deal',
            ]);
            expect(harness.listAdds).toHaveLength(2);
            expect(harness.listUpdates).toEqual([]);
        });
    });

    describe('КП после презентации', () => {
        it('в пачку попадает и обновление строки списка «Презентации»', async () => {
            const harness = makeHarness({
                readResult: {
                    ...READ_RESULT,
                    get_pres_deal: {
                        ID: String(DOCUMENT_PRESENTATION_DEAL_ID),
                        CATEGORY_ID: PRESENTATION_CATEGORY_BITRIX_ID,
                        COMPANY_ID: String(DOCUMENT_COMPANY_ID),
                    },
                },
                lists: {
                    ...makeSalesLists(),
                    sales_presentation: makePresentationList(),
                },
                bitrix: {
                    listItems: [
                        {
                            iblockId: PRESENTATION_IBLOCK_ID,
                            item: {
                                ID: '801',
                                CODE: `${DOCUMENT_BASE_DEAL_ID}_${DOCUMENT_PRESENTATION_DEAL_ID}`,
                                NAME: 'Презентация',
                            },
                        },
                    ],
                },
            });

            const result = await harness.useCase.execute(
                makeEvent({
                    kinds: [offer],
                    presentation: { dealId: DOCUMENT_PRESENTATION_DEAL_ID },
                }),
            );

            // Компания, основная сделка, сделка презентации, история,
            // две строки KPI («КП» и «КП после презентации») и строка
            // списка «Презентации».
            expect(result).toEqual({ commands: 7 });
            expect(harness.dealUpdates.map(update => update.cmd)).toEqual([
                'doc_base_deal',
                'doc_pres_deal',
            ]);
            expect(harness.listUpdates.map(update => update.cmd)).toEqual([
                'doc_pres_list_row',
            ]);
        });
    });

    describe('сбой на записи', () => {
        it('наружу летит EventDocumentWriteError с текстом и причиной исходной ошибки', async () => {
            const harness = makeHarness();
            const cause = new Error('Битрикс ответил 500');
            harness.callBatchWithConcurrency
                .mockResolvedValueOnce([{ result: READ_RESULT }])
                .mockRejectedValueOnce(cause);

            const promise = harness.useCase.execute(makeEvent());

            await expect(promise).rejects.toBeInstanceOf(
                EventDocumentWriteError,
            );
            await expect(promise).rejects.toThrow('Битрикс ответил 500');
            await expect(promise).rejects.toHaveProperty('reason', cause);
        });

        it('писал именно записывающий вызов: чтение прошло, команды были поставлены', async () => {
            const harness = makeHarness();
            harness.callBatchWithConcurrency
                .mockResolvedValueOnce([{ result: READ_RESULT }])
                .mockRejectedValueOnce(new Error('обрыв'));

            await expect(
                harness.useCase.execute(makeEvent()),
            ).rejects.toBeInstanceOf(EventDocumentWriteError);

            expect(harness.callBatchWithConcurrency).toHaveBeenCalledTimes(2);
            expect(harness.companyUpdates).toHaveLength(1);
        });
    });

    describe('сбой на чтении', () => {
        it('наружу летит исходная ошибка, а не EventDocumentWriteError', async () => {
            const harness = makeHarness();
            const cause = new Error('Битрикс недоступен');
            harness.callBatchWithConcurrency.mockRejectedValueOnce(cause);

            const promise = harness.useCase.execute(makeEvent());

            await expect(promise).rejects.toBe(cause);
            await expect(promise).rejects.not.toBeInstanceOf(
                EventDocumentWriteError,
            );
        });

        it('записывающая пачка не отправляется, ничего не пишется', async () => {
            const harness = makeHarness();
            harness.callBatchWithConcurrency.mockRejectedValueOnce(
                new Error('Битрикс недоступен'),
            );

            await expect(
                harness.useCase.execute(makeEvent()),
            ).rejects.toThrow();

            expect(harness.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
            expectNothingWritten(harness);
        });
    });

    describe('основная сделка не найдена', () => {
        it('обычная ошибка с id сделки, а не EventDocumentWriteError', async () => {
            const harness = makeHarness({
                readResult: { get_company: READ_RESULT.get_company },
            });

            const promise = harness.useCase.execute(makeEvent());

            await expect(promise).rejects.toThrow(
                String(DOCUMENT_BASE_DEAL_ID),
            );
            await expect(promise).rejects.not.toBeInstanceOf(
                EventDocumentWriteError,
            );
        });

        it('записывающая пачка не отправляется, ничего не пишется', async () => {
            const harness = makeHarness({
                readResult: { get_company: READ_RESULT.get_company },
            });

            await expect(
                harness.useCase.execute(makeEvent()),
            ).rejects.toThrow();

            expect(harness.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
            expectNothingWritten(harness);
        });
    });
});
