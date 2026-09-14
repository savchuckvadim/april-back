import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordCoreGenerateResult } from '../types/offer-word-core-generate.types';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { InvoiceWordCoreGenerateService } from '../services/invoice-word-core/invoice-word-core-generate.service';
import {
    OfferWordPdfExportParams,
    OfferWordPdfExportService,
} from '../services/pdf-export/offer-word-pdf-export.service';
import {
    PdfMergeParams,
    PdfMergeResult,
    PdfMergeService,
} from '../services/pdf-export/pdf-merge.service';
import { OfferWordMultiGenerateDto } from '../multi/dto/offer-word-multi-generate.dto';
import { OfferWordMultiBuildService } from '../multi/services/offer-word-multi-build.service';

/**
 * Сборка КП v2 дирижирует core-сервисами: сколько раз рендерить, что слить,
 * что склеить. Core-сервисы замоканы — юнит не ходит в LibreOffice и на диск.
 */
type InvoiceCoreResult = Awaited<
    ReturnType<InvoiceWordCoreGenerateService['execute']>
>;

const total = (sum: number, quantity = 12): ProductRowDto =>
    ({
        name: 'Итого',
        price: {
            sum,
            current: sum / 12,
            default: sum,
            month: 0,
            quantity,
            discount: { precent: 1, amount: 0, current: 'percent' },
        },
    }) as unknown as ProductRowDto;

const variant = (
    title: string,
    contractType: CONTRACT_LTYPE,
    sum = 100,
): DocumentVariantDto =>
    ({
        variantSmartId: 1,
        title,
        contractType,
        complect: [],
        contract: { id: 1 },
        supply: { id: 1 },
        rows: [{ name: `строка ${title}` }],
        sets: {
            general: [{ id: title, rows: { garant: [] } }],
            alternative: [],
        },
        total: total(sum),
    }) as unknown as DocumentVariantDto;

const composition = (
    mode: ComplectModeEnum,
    offer: Partial<ComplectCompositionDto['offer']> = {},
): ComplectCompositionDto => ({
    mode,
    offer: {
        infoblocks: ComplectOfferInfoblocksEnum.INDEPENDENT,
        showAlternatives: false,
        ...offer,
    },
    openVariantSmartId: null,
});

const request = (
    over: Partial<OfferWordMultiGenerateDto>,
): OfferWordMultiGenerateDto =>
    ({
        templateId: '1',
        invoiceTemplateId: '2',
        domain: 'test.bitrix24.ru',
        companyId: '3',
        dealId: '4',
        providerId: 5,
        userId: 6,
        contractType: CONTRACT_LTYPE.LIC,
        complect: [],
        contract: { id: 1 },
        supply: { id: 1 },
        rows: [{ name: 'строка запроса' }],
        sets: { general: [], alternative: [] },
        total: total(500),
        invoice: {
            needGeneralInvoice: false,
            needManyInvoices: false,
            isByPresentationInvoices: false,
            invoiceDate: '',
        },
        variants: [],
        ...over,
    }) as unknown as OfferWordMultiGenerateDto;

describe('OfferWordMultiBuildService', () => {
    let renderOffer: jest.Mock<
        Promise<OfferWordCoreGenerateResult>,
        [OfferWordByTemplateGenerateDto]
    >;
    let renderInvoice: jest.Mock<
        Promise<InvoiceCoreResult>,
        [OfferWordByTemplateGenerateDto]
    >;
    let buildPublicPdfLink: jest.Mock<
        Promise<string>,
        [OfferWordPdfExportParams]
    >;
    let merge: jest.Mock<Promise<PdfMergeResult>, [PdfMergeParams]>;
    let service: OfferWordMultiBuildService;

    beforeEach(() => {
        let renderCount = 0;
        renderOffer = jest.fn((dto: OfferWordByTemplateGenerateDto) => {
            renderCount += 1;
            return Promise.resolve({
                template: { id: 1 } as unknown as WordTemplate,
                renderData: { title: dto.total.name },
                docxPath: `/tmp/offer-${renderCount}.docx`,
                resultFileName: `offer-${renderCount}.docx`,
                docxLink: `https://docx/offer-${renderCount}`,
            });
        });
        renderInvoice = jest.fn((dto: OfferWordByTemplateGenerateDto) =>
            Promise.resolve({
                renderData: {},
                template: {},
                savedResults: [
                    {
                        docxLink: `https://docx/invoice-${dto.contractType}`,
                        docxPath: `/tmp/invoice-${dto.contractType}.docx`,
                        resultFileName: `invoice-${dto.contractType}.docx`,
                    },
                ],
            } as unknown as InvoiceCoreResult),
        );
        buildPublicPdfLink = jest.fn((params: OfferWordPdfExportParams) =>
            Promise.resolve(`https://pdf/${params.docxFileName}`),
        );
        merge = jest
            .fn<Promise<PdfMergeResult>, [PdfMergeParams]>()
            .mockResolvedValue({
                absolutePath: '/tmp/merged.pdf',
                link: 'https://pdf/merged.pdf',
                fileName: 'merged.pdf',
            });

        service = new OfferWordMultiBuildService(
            { execute: renderOffer } as unknown as OfferWordCoreGenerateService,
            {
                execute: renderInvoice,
            } as unknown as InvoiceWordCoreGenerateService,
            {
                buildPublicPdfLink,
            } as unknown as OfferWordPdfExportService,
            { merge } as unknown as PdfMergeService,
        );
    });

    it('без участников — один рендер из полей запроса, как раньше', async () => {
        const result = await service.build(request({}));

        expect(renderOffer).toHaveBeenCalledTimes(1);
        const rendered = renderOffer.mock.calls[0][0];
        expect(rendered.contractType).toBe(CONTRACT_LTYPE.LIC);
        expect(rendered.total.price.sum).toBe(500);
        // core-сервис печатает одного участника и про v2 не знает
        expect(rendered).not.toHaveProperty('variants');
        expect(rendered).not.toHaveProperty('composition');

        expect(merge).not.toHaveBeenCalled();
        expect(result.mode).toBe('single');
        expect(result.offers).toHaveLength(1);
        expect(result.offer).toBe(result.offers[0]);
        expect(result.offer.link).toBe('https://pdf/offer-1.docx');
        expect(result.offer.absolutePath).toBe('/tmp/offer-1.pdf');
        expect(result.invoices).toEqual([]);
    });

    it('один участник — один рендер с данными участника', async () => {
        await service.build(
            request({ variants: [variant('Юрист', CONTRACT_LTYPE.ABON, 100)] }),
        );

        expect(renderOffer).toHaveBeenCalledTimes(1);
        const rendered = renderOffer.mock.calls[0][0];
        expect(rendered.contractType).toBe(CONTRACT_LTYPE.ABON);
        expect(rendered.total.price.sum).toBe(100);
        expect(rendered.domain).toBe('test.bitrix24.ru');
    });

    it('merged — один рендер со слитым DTO: строки подряд, итог общий', async () => {
        const result = await service.build(
            request({
                variants: [
                    variant('Юрист', CONTRACT_LTYPE.ABON, 100),
                    variant('Бухгалтер', CONTRACT_LTYPE.ABON, 200),
                ],
                composition: composition(ComplectModeEnum.SINGLE_CONTRACT, {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                }),
            }),
        );

        expect(renderOffer).toHaveBeenCalledTimes(1);
        const rendered = renderOffer.mock.calls[0][0];
        expect(rendered.rows).toHaveLength(2);
        expect(rendered.total.price.sum).toBe(300);
        expect(rendered.sets.general).toHaveLength(2);

        expect(merge).not.toHaveBeenCalled();
        expect(result.mode).toBe('merged');
        expect(result.offers).toHaveLength(1);
        expect(result.warnings).toEqual([]);
    });

    it('independent — рендер на участника и склейка PDF в один документ', async () => {
        const result = await service.build(
            request({
                variants: [
                    variant('Юрист', CONTRACT_LTYPE.ABON),
                    variant('Бухгалтер', CONTRACT_LTYPE.LIC),
                ],
                composition: composition(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(renderOffer).toHaveBeenCalledTimes(2);
        expect(renderOffer.mock.calls[0][0].contractType).toBe(
            CONTRACT_LTYPE.ABON,
        );
        expect(renderOffer.mock.calls[1][0].contractType).toBe(
            CONTRACT_LTYPE.LIC,
        );

        expect(merge).toHaveBeenCalledTimes(1);
        expect(merge.mock.calls[0][0].pdfAbsolutePaths).toEqual([
            '/tmp/offer-1.pdf',
            '/tmp/offer-2.pdf',
        ]);
        expect(result.mode).toBe('independent');
        expect(result.offers).toHaveLength(1);
        expect(result.offer.link).toBe('https://pdf/merged.pdf');
        expect(result.offer.absolutePath).toBe('/tmp/merged.pdf');
    });

    it('independent + separateDocuments — по документу на участника, без склейки', async () => {
        const result = await service.build(
            request({
                variants: [
                    variant('Юрист', CONTRACT_LTYPE.ABON),
                    variant('Бухгалтер', CONTRACT_LTYPE.LIC),
                ],
                composition: composition(ComplectModeEnum.MULTI_CONTRACT, {
                    separateDocuments: true,
                }),
            }),
        );

        expect(renderOffer).toHaveBeenCalledTimes(2);
        expect(merge).not.toHaveBeenCalled();
        expect(result.offers).toHaveLength(2);
        expect(result.offers.map(item => item.link)).toEqual([
            'https://pdf/offer-1.docx',
            'https://pdf/offer-2.docx',
        ]);
        expect(result.offer).toBe(result.offers[0]);
    });

    it('independent в Word — по docx на участника: docx не склеиваются', async () => {
        const result = await service.build(
            request({
                isWord: true,
                variants: [
                    variant('Юрист', CONTRACT_LTYPE.ABON),
                    variant('Бухгалтер', CONTRACT_LTYPE.LIC),
                ],
                composition: composition(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(merge).not.toHaveBeenCalled();
        expect(buildPublicPdfLink).not.toHaveBeenCalled();
        expect(result.offers.map(item => item.link)).toEqual([
            'https://docx/offer-1',
            'https://docx/offer-2',
        ]);
    });

    it('склейка PDF упала — документы отдаются по одному, а не теряются', async () => {
        merge.mockRejectedValue(new Error('pdf-lib: битый файл'));

        const result = await service.build(
            request({
                variants: [
                    variant('Юрист', CONTRACT_LTYPE.ABON),
                    variant('Бухгалтер', CONTRACT_LTYPE.LIC),
                ],
                composition: composition(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(result.offers).toHaveLength(2);
    });

    it('счета — по группе участников на тип договора, участники группы слиты', async () => {
        const result = await service.build(
            request({
                invoice: {
                    needGeneralInvoice: true,
                    needManyInvoices: false,
                    isByPresentationInvoices: false,
                    invoiceDate: '',
                },
                variants: [
                    variant('a', CONTRACT_LTYPE.ABON, 100),
                    variant('b', CONTRACT_LTYPE.LIC, 50),
                    variant('c', CONTRACT_LTYPE.ABON, 200),
                ],
                composition: composition(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(renderInvoice).toHaveBeenCalledTimes(2);
        const [abon, lic] = renderInvoice.mock.calls.map(call => call[0]);
        expect(abon.contractType).toBe(CONTRACT_LTYPE.ABON);
        expect(abon.rows.map(row => row.name)).toEqual([
            'строка a',
            'строка c',
        ]);
        expect(abon.total.price.sum).toBe(300);
        expect(lic.contractType).toBe(CONTRACT_LTYPE.LIC);
        expect(lic.total.price.sum).toBe(50);

        expect(result.invoices.map(item => item.link)).toEqual([
            `https://pdf/invoice-${CONTRACT_LTYPE.ABON}.docx`,
            `https://pdf/invoice-${CONTRACT_LTYPE.LIC}.docx`,
        ]);
    });

    it('compare — печатается открытый вариант, счёт только на него; альтернативы по флагу', async () => {
        const result = await service.build(
            request({
                invoice: {
                    needGeneralInvoice: true,
                    needManyInvoices: false,
                    isByPresentationInvoices: false,
                    invoiceDate: '',
                },
                variants: [
                    variant('Юрист', CONTRACT_LTYPE.ABON, 100),
                    variant('Бухгалтер', CONTRACT_LTYPE.LIC, 200),
                ],
                composition: composition(ComplectModeEnum.COMPARE, {
                    showAlternatives: true,
                }),
            }),
        );

        expect(renderOffer).toHaveBeenCalledTimes(1);
        const rendered = renderOffer.mock.calls[0][0];
        expect(rendered.contractType).toBe(CONTRACT_LTYPE.ABON);
        expect(rendered.total.price.sum).toBe(100);
        // основной набор второго участника ушёл в наборы «для сравнения»
        expect(rendered.sets.alternative).toEqual([
            { id: 'Бухгалтер', rows: { garant: [] } },
        ]);

        expect(renderInvoice).toHaveBeenCalledTimes(1);
        expect(renderInvoice.mock.calls[0][0].contractType).toBe(
            CONTRACT_LTYPE.ABON,
        );
        expect(result.mode).toBe('compare');
        expect(result.invoices).toHaveLength(1);
    });

    it('счёт не собрался — КП всё равно отдаём', async () => {
        renderInvoice.mockRejectedValue(new Error('шаблон счёта не найден'));

        const result = await service.build(
            request({
                invoice: {
                    needGeneralInvoice: true,
                    needManyInvoices: false,
                    isByPresentationInvoices: false,
                    invoiceDate: '',
                },
                variants: [variant('Юрист', CONTRACT_LTYPE.ABON)],
            }),
        );

        expect(result.offers).toHaveLength(1);
        expect(result.invoices).toEqual([]);
    });
});
