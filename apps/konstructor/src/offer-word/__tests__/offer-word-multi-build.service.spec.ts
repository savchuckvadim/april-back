import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ProductRowSetDto } from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import {
    OfferWordByTemplateGenerateDto,
    ProductRowFullSetsDto,
} from '../dto/offer-word-generate-request.dto';
import { OfferWordCoreGenerateResult } from '../types/offer-word-core-generate.types';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import {
    InvoiceWordCoreGenerateResult,
    InvoiceWordCoreGenerateService,
} from '../services/invoice-word-core/invoice-word-core-generate.service';
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

const garantRow = (
    name: string,
    supplyName: string,
    alternativeName?: string,
): ProductRowDto =>
    Object.assign(new ProductRowDto(), {
        name,
        alternativeName,
        supply: { name: supplyName },
    });

const garantSet = (...garant: ProductRowDto[]): ProductRowSetDto =>
    Object.assign(new ProductRowSetDto(), {
        id: 1,
        show: true,
        rows: { garant },
        total: [],
    });

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
    // наборы, из которых «сборка» счетов отдаёт файлы (по умолчанию — один основной)
    let invoiceSets: Array<
        Pick<InvoiceWordCoreGenerateResult, 'setKind' | 'setIndex'>
    >;
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
        invoiceSets = [{ setKind: 'general', setIndex: 0 }];
        renderInvoice = jest.fn((dto: OfferWordByTemplateGenerateDto) =>
            Promise.resolve({
                renderData: {},
                template: {},
                // по счёту на набор из invoiceSets: вид и индекс набора едут с результатом
                savedResults: invoiceSets.map(invoiceSet => ({
                    docxLink: `https://docx/invoice-${dto.contractType}`,
                    docxPath: `/tmp/invoice-${dto.contractType}.docx`,
                    resultFileName: `invoice-${dto.contractType}.docx`,
                    ...invoiceSet,
                })),
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

    describe('число счетов следует за договором', () => {
        const generalInvoice = {
            needGeneralInvoice: true,
            needManyInvoices: false,
            isByPresentationInvoices: false,
            invoiceDate: '',
        };

        // вариант с одним основным набором: строка Гаранта и итог набора
        const setVariant = (
            title: string,
            contractType: CONTRACT_LTYPE,
            sum: number,
            supplyName: string,
            quantity = 12,
        ): DocumentVariantDto => ({
            ...variant(title, contractType, sum),
            sets: {
                general: [
                    Object.assign(new ProductRowSetDto(), {
                        id: 1,
                        show: true,
                        rows: {
                            garant: [garantRow(`Гарант-${title}`, supplyName)],
                        },
                        total: [total(sum, quantity)],
                    }),
                ],
                alternative: [],
            },
        });

        const lawyer = (
            contractType = CONTRACT_LTYPE.ABON,
            quantity = 12,
        ): DocumentVariantDto =>
            setVariant('Юрист', contractType, 100, 'Интернет 5 ОД', quantity);
        const accountant = (
            contractType = CONTRACT_LTYPE.ABON,
            quantity = 12,
        ): DocumentVariantDto =>
            setVariant(
                'Бухгалтер',
                contractType,
                200,
                'Проксима 3 ОД',
                quantity,
            );

        const garantNames = (dto: OfferWordByTemplateGenerateDto): string[] =>
            (dto.sets.general[0].rows.garant ?? []).map(item => item.name);

        it('single_contract, один тип договора — один счёт на все варианты, в нём строки обоих', async () => {
            const result = await service.build(
                request({
                    invoice: generalInvoice,
                    variants: [lawyer(), accountant()],
                    composition: composition(ComplectModeEnum.SINGLE_CONTRACT),
                }),
            );

            expect(renderInvoice).toHaveBeenCalledTimes(1);
            const sent = renderInvoice.mock.calls[0][0];
            expect(sent.contractType).toBe(CONTRACT_LTYPE.ABON);
            expect(sent.sets.general).toHaveLength(1);
            expect(garantNames(sent)).toEqual([
                'Гарант-Юрист',
                'Гарант-Бухгалтер',
            ]);
            // общий итог набора — сумма вариантов
            expect(sent.sets.general[0].total).toHaveLength(1);
            expect(sent.sets.general[0].total[0].price.sum).toBe(300);
            expect(sent.sets.general[0].id).toBe(0);
            expect(sent.sets.general[0].show).toBe(false);

            expect(result.invoices).toHaveLength(1);
            // имя — по первой строке Гаранта сведённого набора
            expect(result.invoices[0].name).toBe(
                'Счёт Гарант-Юрист - Интернет 5 ОД',
            );
            expect(result.warnings).toEqual([]);
        });

        it('single_contract с единым порядком инфоблоков — тоже один счёт', async () => {
            await service.build(
                request({
                    invoice: generalInvoice,
                    variants: [lawyer(), accountant()],
                    composition: composition(ComplectModeEnum.SINGLE_CONTRACT, {
                        infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                    }),
                }),
            );

            expect(renderInvoice).toHaveBeenCalledTimes(1);
            expect(renderInvoice.mock.calls[0][0].sets.general).toHaveLength(1);
        });

        it('single_contract, сроки наборов разные — один счёт, предупреждение про срок одно', async () => {
            const result = await service.build(
                request({
                    invoice: generalInvoice,
                    variants: [
                        lawyer(CONTRACT_LTYPE.ABON, 12),
                        accountant(CONTRACT_LTYPE.ABON, 6),
                    ],
                    composition: composition(ComplectModeEnum.SINGLE_CONTRACT),
                }),
            );

            expect(renderInvoice).toHaveBeenCalledTimes(1);
            expect(result.warnings).toEqual([
                'срок набора «Итого» (6) отличается от первого (12) — взят первый',
            ]);
        });

        it('multi_contract, один тип договора — по счёту на вариант, каждый со своим вариантом', async () => {
            const result = await service.build(
                request({
                    invoice: generalInvoice,
                    variants: [lawyer(), accountant()],
                    composition: composition(ComplectModeEnum.MULTI_CONTRACT),
                }),
            );

            expect(renderInvoice).toHaveBeenCalledTimes(2);
            const [first, second] = renderInvoice.mock.calls.map(
                call => call[0],
            );
            expect(garantNames(first)).toEqual(['Гарант-Юрист']);
            expect(first.total.price.sum).toBe(100);
            expect(first.sets.general[0].total[0].price.sum).toBe(100);
            expect(garantNames(second)).toEqual(['Гарант-Бухгалтер']);
            expect(second.total.price.sum).toBe(200);
            expect(second.sets.general[0].total[0].price.sum).toBe(200);

            expect(result.invoices.map(item => item.name)).toEqual([
                'Счёт Гарант-Юрист - Интернет 5 ОД',
                'Счёт Гарант-Бухгалтер - Проксима 3 ОД',
            ]);
            expect(result.warnings).toEqual([]);
        });

        it('single_contract, типы договора разные — по счёту на тип договора, группа сведена в один набор, есть предупреждение', async () => {
            const result = await service.build(
                request({
                    invoice: generalInvoice,
                    variants: [
                        setVariant('a', CONTRACT_LTYPE.ABON, 100, 'Интернет 5'),
                        setVariant('b', CONTRACT_LTYPE.LIC, 50, 'Интернет 1'),
                        setVariant('c', CONTRACT_LTYPE.ABON, 200, 'Проксима 3'),
                    ],
                    composition: composition(ComplectModeEnum.SINGLE_CONTRACT),
                }),
            );

            expect(renderInvoice).toHaveBeenCalledTimes(2);
            const [abon, lic] = renderInvoice.mock.calls.map(call => call[0]);
            expect(abon.contractType).toBe(CONTRACT_LTYPE.ABON);
            expect(abon.sets.general).toHaveLength(1);
            expect(garantNames(abon)).toEqual(['Гарант-a', 'Гарант-c']);
            expect(abon.sets.general[0].total[0].price.sum).toBe(300);
            expect(lic.contractType).toBe(CONTRACT_LTYPE.LIC);
            expect(garantNames(lic)).toEqual(['Гарант-b']);
            expect(lic.sets.general[0].total[0].price.sum).toBe(50);

            expect(result.invoices.map(item => item.link)).toEqual([
                `https://pdf/invoice-${CONTRACT_LTYPE.ABON}.docx`,
                `https://pdf/invoice-${CONTRACT_LTYPE.LIC}.docx`,
            ]);
            expect(result.warnings).toEqual([
                'Счёт разделён по типам договора: у наборов разные типы',
            ]);
        });

        it('compare — один счёт по первому варианту, наборы не сводятся', async () => {
            const result = await service.build(
                request({
                    invoice: generalInvoice,
                    variants: [
                        lawyer(CONTRACT_LTYPE.ABON),
                        accountant(CONTRACT_LTYPE.LIC),
                    ],
                    composition: composition(ComplectModeEnum.COMPARE),
                }),
            );

            expect(renderInvoice).toHaveBeenCalledTimes(1);
            const sent = renderInvoice.mock.calls[0][0];
            expect(sent.contractType).toBe(CONTRACT_LTYPE.ABON);
            expect(garantNames(sent)).toEqual(['Гарант-Юрист']);
            expect(sent.sets.general[0].id).toBe(1);
            expect(sent.total.price.sum).toBe(100);
            expect(result.invoices).toHaveLength(1);
            expect(result.warnings).toEqual([]);
        });

        it('composition не прислан — один счёт по первому варианту, как раньше', async () => {
            await service.build(
                request({
                    invoice: generalInvoice,
                    variants: [lawyer(), accountant()],
                }),
            );

            expect(renderInvoice).toHaveBeenCalledTimes(1);
            expect(garantNames(renderInvoice.mock.calls[0][0])).toEqual([
                'Гарант-Юрист',
            ]);
        });

        it.each([
            ComplectModeEnum.COMPARE,
            ComplectModeEnum.SINGLE_CONTRACT,
            ComplectModeEnum.MULTI_CONTRACT,
        ])(
            'один вариант при режиме %s — один счёт с наборами варианта как есть',
            async mode => {
                await service.build(
                    request({
                        invoice: generalInvoice,
                        variants: [lawyer()],
                        composition: composition(mode),
                    }),
                );

                expect(renderInvoice).toHaveBeenCalledTimes(1);
                const sent = renderInvoice.mock.calls[0][0];
                expect(garantNames(sent)).toEqual(['Гарант-Юрист']);
                expect(sent.sets.general[0].id).toBe(1);
            },
        );

        it('вариантов нет — один счёт из полей запроса', async () => {
            await service.build(request({ invoice: generalInvoice }));

            expect(renderInvoice).toHaveBeenCalledTimes(1);
            expect(renderInvoice.mock.calls[0][0].total.price.sum).toBe(500);
        });
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

    describe('имена счетов выводятся из набора, из которого собран счёт', () => {
        const invoiceFlags = {
            needGeneralInvoice: true,
            needManyInvoices: true,
            isByPresentationInvoices: false,
            invoiceDate: '',
        };
        const fullSets = Object.assign(new ProductRowFullSetsDto(), {
            general: [
                garantSet(garantRow('Гарант-Юрист', 'Интернет 5 ОД')),
                garantSet(garantRow('Гарант-Бухгалтер', 'Проксима 3 ОД')),
            ],
            alternative: [
                garantSet(garantRow('Гарант-Эксперт', 'Интернет 1 ОД')),
                garantSet(
                    garantRow(
                        'Гарант-Строитель',
                        'Интернет 2 ОД',
                        'Строитель PRO',
                    ),
                ),
            ],
        });
        const emptySets = Object.assign(new ProductRowFullSetsDto(), {
            general: [garantSet(), garantSet()],
            alternative: [garantSet()],
        });

        const invoiceNames = async (
            sets: ProductRowFullSetsDto,
        ): Promise<string[]> => {
            const result = await service.build(
                request({ sets, invoice: invoiceFlags }),
            );
            return result.invoices.map(item => item.name);
        };

        it('первый счёт из general — по первому набору', async () => {
            invoiceSets = [{ setKind: 'general', setIndex: 0 }];

            expect(await invoiceNames(fullSets)).toEqual([
                'Счёт Гарант-Юрист - Интернет 5 ОД',
            ]);
        });

        it('второй счёт из второго набора general называется по своему набору', async () => {
            invoiceSets = [
                { setKind: 'general', setIndex: 0 },
                { setKind: 'general', setIndex: 1 },
            ];

            expect(await invoiceNames(fullSets)).toEqual([
                'Счёт Гарант-Юрист - Интернет 5 ОД',
                'Счёт Гарант-Бухгалтер - Проксима 3 ОД',
            ]);
        });

        it('счёт из alternative называется по своему набору для сравнения', async () => {
            invoiceSets = [
                { setKind: 'general', setIndex: 0 },
                { setKind: 'alternative', setIndex: 1 },
            ];

            expect(await invoiceNames(fullSets)).toEqual([
                'Счёт Гарант-Юрист - Интернет 5 ОД',
                'Счёт Строитель PRO - Интернет 2 ОД',
            ]);
        });

        it('основные наборы и наборы для сравнения вместе — у каждого счёта своё имя', async () => {
            invoiceSets = [
                { setKind: 'general', setIndex: 0 },
                { setKind: 'general', setIndex: 1 },
                { setKind: 'alternative', setIndex: 0 },
                { setKind: 'alternative', setIndex: 1 },
            ];

            expect(await invoiceNames(fullSets)).toEqual([
                'Счёт Гарант-Юрист - Интернет 5 ОД',
                'Счёт Гарант-Бухгалтер - Проксима 3 ОД',
                'Счёт Гарант-Эксперт - Интернет 1 ОД',
                'Счёт Строитель PRO - Интернет 2 ОД',
            ]);
        });

        it('строки Гаранта в наборах нет — «Счёт» для первого и «Счёт - N» для следующих', async () => {
            invoiceSets = [
                { setKind: 'general', setIndex: 0 },
                { setKind: 'general', setIndex: 1 },
                { setKind: 'alternative', setIndex: 0 },
            ];

            expect(await invoiceNames(emptySets)).toEqual([
                'Счёт',
                'Счёт - 1',
                'Счёт - 2',
            ]);
        });
    });

    describe('счёт не построен', () => {
        const withGeneralInvoice = {
            needGeneralInvoice: true,
            needManyInvoices: false,
            isByPresentationInvoices: false,
            invoiceDate: '',
        };
        const noTemplate: InvoiceCoreResult = {
            renderData: null,
            template: null,
            savedResults: [],
            notBuiltReason: 'для портала не найден шаблон счёта',
        };

        it('шаблон счёта не найден — КП отдано, в warnings строка про счёт', async () => {
            renderInvoice.mockResolvedValue(noTemplate);

            const result = await service.build(
                request({
                    invoice: withGeneralInvoice,
                    variants: [variant('Юрист', CONTRACT_LTYPE.ABON)],
                }),
            );

            expect(result.offers).toHaveLength(1);
            expect(result.invoices).toEqual([]);
            expect(result.warnings).toEqual([
                'Счёт не сформирован: для портала не найден шаблон счёта',
            ]);
        });

        it('шаблон не найден для нескольких счетов — предупреждение одно', async () => {
            renderInvoice.mockResolvedValue(noTemplate);

            const result = await service.build(
                request({
                    invoice: withGeneralInvoice,
                    variants: [
                        variant('a', CONTRACT_LTYPE.ABON),
                        variant('b', CONTRACT_LTYPE.LIC),
                    ],
                    composition: composition(ComplectModeEnum.MULTI_CONTRACT),
                }),
            );

            expect(renderInvoice).toHaveBeenCalledTimes(2);
            expect(result.warnings).toEqual([
                'Счёт не сформирован: для портала не найден шаблон счёта',
            ]);
        });

        it('сбой сборки счёта — КП отдано, в warnings причина сбоя', async () => {
            renderInvoice.mockRejectedValue(
                new Error('Файл шаблона счёта не найден в хранилище'),
            );

            const result = await service.build(
                request({
                    invoice: withGeneralInvoice,
                    variants: [variant('Юрист', CONTRACT_LTYPE.ABON)],
                }),
            );

            expect(result.offers).toHaveLength(1);
            expect(result.invoices).toEqual([]);
            expect(result.warnings).toEqual([
                'Счёт не сформирован: Файл шаблона счёта не найден в хранилище',
            ]);
        });

        it('счёт не запрошен — предупреждений про счёт нет, шаблон не ищется', async () => {
            const result = await service.build(request({}));

            expect(renderInvoice).not.toHaveBeenCalled();
            expect(result.warnings).toEqual([]);
        });
    });
});
