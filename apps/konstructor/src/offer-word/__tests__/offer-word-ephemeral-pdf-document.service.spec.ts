import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { basename } from 'path';
import { StorageService } from '@lib/core/storage';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import {
    createSupplyKit,
    INTERNET_10_CAPTION,
    INTERNET_5_CAPTION,
    supplyDto,
} from '@app/konstructor/document-generate/supply/__tests__/supply-caption.fixtures';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { InnerDealService } from '@app/konstructor/modules/inner-deal/services/inner-deal.service';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { OfferWordEphemeralPdfDocumentService } from '../services/preview-generate/offer-word-ephemeral-pdf-document.service';
import { OfferWordPdfExportService } from '../services/pdf-export/offer-word-pdf-export.service';
import {
    PdfMergeParams,
    PdfMergeResult,
    PdfMergeService,
} from '../services/pdf-export/pdf-merge.service';
import {
    OfferWordCoreGenerateOptions,
    OfferWordCoreGenerateResult,
} from '../types/offer-word-core-generate.types';
import {
    previewComposition,
    previewRequest,
    previewVariant,
} from './offer-word-preview.fixtures';

/**
 * Превью печатает то же, что напечатает формирование КП с вариантами: режим
 * определяет resolveDocumentVariants, запросы на рендер — planOfferRenders.
 * Ядро генерации, LibreOffice, склейка и диск замоканы: диск — карта файлов
 * в памяти, по ней видно, что после превью ничего не осталось.
 */
const setup = async () => {
    const files = new Map<string, Buffer>();
    let renderCount = 0;

    const storage = {
        readFile: jest.fn((path: string) => {
            const content = files.get(path);
            return content
                ? Promise.resolve(content)
                : Promise.reject(new Error(`Файла нет: ${path}`));
        }),
        fileExists: jest.fn((path: string) => Promise.resolve(files.has(path))),
        deleteFile: jest.fn((path: string) => {
            files.delete(path);
            return Promise.resolve();
        }),
    };

    // ядро кладёт DOCX на диск и отдаёт путь
    const renderDocx = (): Promise<OfferWordCoreGenerateResult> => {
        renderCount += 1;
        const docxPath = `/disk/offer-${renderCount}.docx`;
        files.set(docxPath, Buffer.from(`docx-${renderCount}`));
        return Promise.resolve({
            template: new WordTemplate({}),
            renderData: {},
            docxPath,
            resultFileName: `offer-${renderCount}.docx`,
        });
    };
    const execute = jest.fn<
        Promise<OfferWordCoreGenerateResult>,
        [OfferWordByTemplateGenerateDto, OfferWordCoreGenerateOptions]
    >(renderDocx);

    // конвертация кладёт PDF рядом с DOCX
    const convertToPdf = (docxPath: string): Promise<string> => {
        const pdfPath = docxPath.replace(/\.docx$/, '.pdf');
        files.set(pdfPath, Buffer.from(`pdf-${basename(docxPath, '.docx')}`));
        return Promise.resolve(pdfPath);
    };
    const convertDocxToPdfPath = jest.fn<
        Promise<string>,
        [string, AbortSignal | undefined]
    >(convertToPdf);

    const merge = jest.fn<Promise<PdfMergeResult>, [PdfMergeParams]>(params => {
        const parts = params.pdfAbsolutePaths.map(path =>
            String(files.get(path)),
        );
        const absolutePath = '/disk/merged.pdf';
        files.set(absolutePath, Buffer.from(`склейка(${parts.join('+')})`));
        return Promise.resolve({
            absolutePath,
            link: 'https://pdf/merged.pdf',
            fileName: 'offer-merged.pdf',
        });
    });

    const setOfferTemplateByDomainAndDealId = jest.fn<
        Promise<void>,
        [string, number, bigint]
    >(() => Promise.resolve());

    const kit = createSupplyKit();
    const enricher = new SupplyPayloadEnricherService(kit.supplyTexts);

    const moduleRef = await Test.createTestingModule({
        providers: [
            OfferWordEphemeralPdfDocumentService,
            { provide: OfferWordCoreGenerateService, useValue: { execute } },
            {
                provide: OfferWordPdfExportService,
                useValue: { convertDocxToPdfPath },
            },
            { provide: PdfMergeService, useValue: { merge } },
            { provide: StorageService, useValue: storage },
            {
                provide: InnerDealService,
                useValue: { setOfferTemplateByDomainAndDealId },
            },
            { provide: SupplyPayloadEnricherService, useValue: enricher },
        ],
    }).compile();

    return {
        service: moduleRef.get(OfferWordEphemeralPdfDocumentService),
        files,
        execute,
        renderDocx,
        convertDocxToPdfPath,
        convertToPdf,
        merge,
        setOfferTemplateByDomainAndDealId,
        repository: kit.repository,
    };
};

const text = (buffer: Buffer): string => buffer.toString('utf8');

describe('OfferWordEphemeralPdfDocumentService: превью КП с вариантами', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('без вариантов печатает верхние поля запроса, как раньше', async () => {
        const {
            service,
            files,
            execute,
            merge,
            setOfferTemplateByDomainAndDealId,
        } = await setup();

        const result =
            await service.buildPdfBufferRemovingFiles(previewRequest());

        expect(execute).toHaveBeenCalledTimes(1);
        const [rendered, options] = execute.mock.calls[0];
        expect(options).toEqual({ publishDocxLink: false });
        expect(rendered.contractType).toBe(CONTRACT_LTYPE.LIC);
        expect(rendered.total.name).toBe('Итого запроса');
        expect(rendered.rows.map(row => row.name)).toEqual(['Строка запроса']);
        // core-сервис печатает одного участника и про варианты не знает
        expect(rendered).not.toHaveProperty('variants');
        expect(rendered).not.toHaveProperty('composition');

        expect(merge).not.toHaveBeenCalled();
        expect(result.pdfFileName).toBe('offer-1.pdf');
        expect(text(result.pdfBuffer)).toBe('pdf-offer-1');
        expect(files.size).toBe(0);
        expect(setOfferTemplateByDomainAndDealId).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            4,
            1n,
        );
    });

    it('пустой список вариантов — тоже верхние поля запроса', async () => {
        const { service, execute, merge } = await setup();

        await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [],
                composition: previewComposition(
                    ComplectModeEnum.MULTI_CONTRACT,
                ),
            }),
        );

        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][0].total.name).toBe('Итого запроса');
        expect(merge).not.toHaveBeenCalled();
    });

    it('подписи поставок верха запроса дополняются из справочника', async () => {
        const { service, execute } = await setup();

        await service.buildPdfBufferRemovingFiles(previewRequest());

        const rendered = execute.mock.calls[0][0];
        expect(rendered.supply.quantityForKp).toBe(INTERNET_5_CAPTION);
        expect(rendered.total.product.quantityForKp).toBe(INTERNET_5_CAPTION);
        expect(rendered.rows.map(row => row.product.quantityForKp)).toEqual([
            INTERNET_5_CAPTION,
        ]);
    });

    it('один вариант — печатается он, а настройки сборки ничего не меняют', async () => {
        const { service, execute, merge } = await setup();

        await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [previewVariant('Юрист', CONTRACT_LTYPE.ABON, 100)],
                composition: previewComposition(
                    ComplectModeEnum.MULTI_CONTRACT,
                ),
            }),
        );

        expect(execute).toHaveBeenCalledTimes(1);
        const rendered = execute.mock.calls[0][0];
        expect(rendered.contractType).toBe(CONTRACT_LTYPE.ABON);
        expect(rendered.total.name).toBe('Итого Юрист');
        expect(rendered.rows.map(row => row.name)).toEqual(['Строка Юрист']);
        // всё про сделку остаётся от запроса
        expect(rendered.domain).toBe('test.bitrix24.ru');
        expect(rendered.templateId).toBe('1');
        expect(rendered).not.toHaveProperty('variants');
        expect(merge).not.toHaveBeenCalled();
    });

    it('merged — один рендер слитого варианта: строки подряд, итог общий', async () => {
        const { service, files, execute, merge } = await setup();

        const result = await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [
                    previewVariant('Юрист', CONTRACT_LTYPE.ABON, 100),
                    previewVariant('Бухгалтер', CONTRACT_LTYPE.ABON, 200),
                ],
                composition: previewComposition(
                    ComplectModeEnum.SINGLE_CONTRACT,
                    {
                        infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                    },
                ),
            }),
        );

        expect(execute).toHaveBeenCalledTimes(1);
        const rendered = execute.mock.calls[0][0];
        expect(rendered.rows.map(row => row.name)).toEqual([
            'Строка Юрист',
            'Строка Бухгалтер',
        ]);
        expect(rendered.total.price.sum).toBe(300);
        expect(rendered.sets.general).toHaveLength(2);
        expect(rendered).not.toHaveProperty('variants');

        expect(merge).not.toHaveBeenCalled();
        expect(text(result.pdfBuffer)).toBe('pdf-offer-1');
        expect(files.size).toBe(0);
    });

    it('merged с разными сроками — расхождение уходит в лог, превью печатается', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { service, execute } = await setup();

        await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [
                    previewVariant('Юрист', CONTRACT_LTYPE.ABON, 100),
                    previewVariant(
                        'Бухгалтер',
                        CONTRACT_LTYPE.ABON,
                        200,
                        supplyDto('internet_5', 5),
                        6,
                    ),
                ],
                composition: previewComposition(
                    ComplectModeEnum.SINGLE_CONTRACT,
                    {
                        infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                    },
                ),
            }),
        );

        expect(execute).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('срок набора «Итого Бухгалтер» (6)'),
        );
    });

    it('independent с двумя вариантами — два рендера и одна склейка, результат один PDF', async () => {
        const {
            service,
            files,
            execute,
            convertDocxToPdfPath,
            merge,
            setOfferTemplateByDomainAndDealId,
        } = await setup();
        const controller = new AbortController();

        const result = await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [
                    previewVariant('Юрист', CONTRACT_LTYPE.ABON),
                    previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC),
                ],
                composition: previewComposition(
                    ComplectModeEnum.MULTI_CONTRACT,
                ),
            }),
            controller.signal,
        );

        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute.mock.calls.map(call => call[0].contractType)).toEqual([
            CONTRACT_LTYPE.ABON,
            CONTRACT_LTYPE.LIC,
        ]);
        expect(execute.mock.calls.map(call => call[0].total.name)).toEqual([
            'Итого Юрист',
            'Итого Бухгалтер',
        ]);
        // конвертация знает про отмену клиента
        expect(convertDocxToPdfPath).toHaveBeenCalledTimes(2);
        expect(convertDocxToPdfPath.mock.calls.map(call => call[1])).toEqual([
            controller.signal,
            controller.signal,
        ]);
        // пул конвертации занят одним документом за раз
        expect(execute.mock.invocationCallOrder[1]).toBeGreaterThan(
            convertDocxToPdfPath.mock.invocationCallOrder[0],
        );

        expect(merge).toHaveBeenCalledTimes(1);
        expect(merge.mock.calls[0][0]).toEqual({
            pdfAbsolutePaths: ['/disk/offer-1.pdf', '/disk/offer-2.pdf'],
            domain: 'test.bitrix24.ru',
            userId: 6,
            year: expect.stringMatching(/^\d{4}$/) as string,
        });
        expect(result.pdfFileName).toBe('offer-merged.pdf');
        expect(text(result.pdfBuffer)).toBe('склейка(pdf-offer-1+pdf-offer-2)');
        // на диске не осталось ни DOCX, ни PDF участников, ни склейки
        expect(files.size).toBe(0);
        expect(setOfferTemplateByDomainAndDealId).toHaveBeenCalledTimes(1);
    });

    it('independent + separateDocuments — превью всё равно один склеенный PDF', async () => {
        const { service, execute, merge } = await setup();

        const result = await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [
                    previewVariant('Юрист', CONTRACT_LTYPE.ABON),
                    previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC),
                ],
                composition: previewComposition(
                    ComplectModeEnum.MULTI_CONTRACT,
                    {
                        separateDocuments: true,
                    },
                ),
            }),
        );

        expect(execute).toHaveBeenCalledTimes(2);
        expect(merge).toHaveBeenCalledTimes(1);
        expect(text(result.pdfBuffer)).toBe('склейка(pdf-offer-1+pdf-offer-2)');
    });

    it('независимые варианты — подписи поставок дополнены у каждого, справочник читается по разу на поставку', async () => {
        const { service, execute, repository } = await setup();

        await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [
                    previewVariant(
                        'Юрист',
                        CONTRACT_LTYPE.ABON,
                        100,
                        supplyDto('internet_5', 5),
                    ),
                    previewVariant(
                        'Бухгалтер',
                        CONTRACT_LTYPE.LIC,
                        200,
                        supplyDto('internet_10', 10),
                    ),
                ],
                composition: previewComposition(
                    ComplectModeEnum.MULTI_CONTRACT,
                ),
            }),
        );

        const [lawyer, accountant] = execute.mock.calls.map(call => call[0]);
        expect(lawyer.supply.quantityForKp).toBe(INTERNET_5_CAPTION);
        expect(lawyer.total.product.quantityForKp).toBe(INTERNET_5_CAPTION);
        expect(
            lawyer.sets.general[0].rows.garant?.[0].product.quantityForKp,
        ).toBe(INTERNET_5_CAPTION);
        expect(accountant.supply.quantityForKp).toBe(INTERNET_10_CAPTION);
        expect(accountant.rows[0].product.quantityForKp).toBe(
            INTERNET_10_CAPTION,
        );
        expect(accountant.total.product.quantityForKp).toBe(
            INTERNET_10_CAPTION,
        );
        // верх запроса и первый вариант несут одну поставку: чтение одно
        expect(repository.byCodeCalls).toBe(2);
    });

    it('compare с показом наборов для сравнения — открытый вариант с наборами остальных', async () => {
        const { service, execute, merge } = await setup();

        await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [
                    previewVariant('Юрист', CONTRACT_LTYPE.ABON, 100),
                    previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC, 200),
                ],
                composition: previewComposition(ComplectModeEnum.COMPARE, {
                    showAlternatives: true,
                }),
            }),
        );

        expect(execute).toHaveBeenCalledTimes(1);
        const rendered = execute.mock.calls[0][0];
        expect(rendered.contractType).toBe(CONTRACT_LTYPE.ABON);
        expect(rendered.total.name).toBe('Итого Юрист');
        // основной набор второго участника ушёл в наборы «для сравнения»
        expect(rendered.sets.alternative.map(set => set.total[0].name)).toEqual(
            ['Итого Бухгалтер'],
        );
        expect(rendered.sets.general.map(set => set.total[0].name)).toEqual([
            'Итого Юрист',
        ]);
        expect(merge).not.toHaveBeenCalled();
    });

    it('compare без показа — наборы остальных участников не печатаются', async () => {
        const { service, execute } = await setup();

        await service.buildPdfBufferRemovingFiles(
            previewRequest({
                variants: [
                    previewVariant('Юрист', CONTRACT_LTYPE.ABON, 100),
                    previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC, 200),
                ],
            }),
        );

        expect(execute).toHaveBeenCalledTimes(1);
        const rendered = execute.mock.calls[0][0];
        expect(rendered.total.name).toBe('Итого Юрист');
        expect(rendered.sets.alternative).toEqual([]);
    });

    it('сбой склейки — ошибка с понятным текстом, файлы убраны, шаблон в сделку не пишется', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const { service, files, merge, setOfferTemplateByDomainAndDealId } =
            await setup();
        merge.mockRejectedValue(new Error('pdf-lib: битый файл'));

        await expect(
            service.buildPdfBufferRemovingFiles(
                previewRequest({
                    variants: [
                        previewVariant('Юрист', CONTRACT_LTYPE.ABON),
                        previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC),
                    ],
                    composition: previewComposition(
                        ComplectModeEnum.MULTI_CONTRACT,
                    ),
                }),
            ),
        ).rejects.toThrow(
            'Не удалось склеить PDF вариантов для превью: pdf-lib: битый файл',
        );

        expect(files.size).toBe(0);
        expect(setOfferTemplateByDomainAndDealId).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('сбой рендера второго варианта — PDF первого убирается с диска, склейки нет', async () => {
        const { service, files, execute, renderDocx, merge } = await setup();
        // первый вариант печатается, на втором ядро падает
        execute
            .mockImplementationOnce(renderDocx)
            .mockRejectedValueOnce(new Error('Шаблон КП не найден'));

        await expect(
            service.buildPdfBufferRemovingFiles(
                previewRequest({
                    variants: [
                        previewVariant('Юрист', CONTRACT_LTYPE.ABON),
                        previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC),
                    ],
                    composition: previewComposition(
                        ComplectModeEnum.MULTI_CONTRACT,
                    ),
                }),
            ),
        ).rejects.toThrow('Шаблон КП не найден');

        expect(merge).not.toHaveBeenCalled();
        expect(files.size).toBe(0);
    });

    it('конвертация упала — DOCX убирается, ошибка уходит наружу', async () => {
        const { service, files, convertDocxToPdfPath } = await setup();
        convertDocxToPdfPath.mockRejectedValue(new Error('LibreOffice занят'));

        await expect(
            service.buildPdfBufferRemovingFiles(previewRequest()),
        ).rejects.toThrow('LibreOffice занят');

        expect(files.size).toBe(0);
    });

    it('отмена между участниками — следующий не рендерится, файлы убраны', async () => {
        const {
            service,
            files,
            execute,
            convertDocxToPdfPath,
            convertToPdf,
            merge,
        } = await setup();
        const controller = new AbortController();
        convertDocxToPdfPath.mockImplementation(async docxPath => {
            const pdfPath = await convertToPdf(docxPath);
            // клиент отменил операцию, пока шла первая конвертация
            controller.abort();
            return pdfPath;
        });

        await expect(
            service.buildPdfBufferRemovingFiles(
                previewRequest({
                    variants: [
                        previewVariant('Юрист', CONTRACT_LTYPE.ABON),
                        previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC),
                    ],
                    composition: previewComposition(
                        ComplectModeEnum.MULTI_CONTRACT,
                    ),
                }),
                controller.signal,
            ),
        ).rejects.toThrow('Операция отменена клиентом');

        expect(execute).toHaveBeenCalledTimes(1);
        expect(merge).not.toHaveBeenCalled();
        expect(files.size).toBe(0);
    });

    it('шаблон в сделку записался с ошибкой — превью всё равно отдаёт PDF', async () => {
        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        const { service, setOfferTemplateByDomainAndDealId } = await setup();
        setOfferTemplateByDomainAndDealId.mockRejectedValue(
            new Error('Битрикс недоступен'),
        );

        const result =
            await service.buildPdfBufferRemovingFiles(previewRequest());

        expect(text(result.pdfBuffer)).toBe('pdf-offer-1');
        expect(consoleError).toHaveBeenCalled();
    });
});
