import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { DocumentBuildService } from '../services/document-build.service';
import { InvoiceWordCoreGenerateService } from '../services/invoice-word-core/invoice-word-core-generate.service';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { OfferWordPdfExportService } from '../services/pdf-export/offer-word-pdf-export.service';

/**
 * Одиночный путь: имена на Диске читаемые, файлы на сервере остаются с
 * техническими именами (от них зависят LibreOffice и публичные ссылки).
 */
const garant = (name: string, supplyName: string): ProductRowDto =>
    ({ name, supply: { name: supplyName } }) as unknown as ProductRowDto;

const request = (
    over: Partial<OfferWordByTemplateGenerateDto> = {},
): OfferWordByTemplateGenerateDto =>
    ({
        domain: 'test.bitrix24.ru',
        userId: 6,
        isWord: false,
        sets: {
            general: [
                { rows: { garant: [garant('Гарант-Юрист', 'Интернет 1 ОД')] } },
            ],
            alternative: [],
        },
        invoice: { needGeneralInvoice: true, needManyInvoices: false },
        ...over,
    }) as unknown as OfferWordByTemplateGenerateDto;

const setup = (invoiceNumber: string) => {
    const offerCore = {
        execute: jest.fn().mockResolvedValue({
            template: { id: 1 },
            renderData: {},
            docxPath: '/storage/offer-1b2c.docx',
            resultFileName: 'offer-1b2c.docx',
            docxLink: 'https://server/offer-1b2c.docx',
        }),
    };
    const invoiceCore = {
        execute: jest.fn().mockResolvedValue({
            savedResults: [
                {
                    docxPath: '/storage/invoice-9f8e.docx',
                    resultFileName: 'invoice-9f8e.docx',
                    docxLink: 'https://server/invoice-9f8e.docx',
                    setKind: 'general',
                    setIndex: 0,
                    renderData: { InvoiceNumber: invoiceNumber },
                },
            ],
        }),
    };
    const pdfExport = {
        buildPublicPdfLink: jest
            .fn()
            .mockImplementation(({ docxFileName }: { docxFileName: string }) =>
                Promise.resolve(
                    `https://server/${docxFileName.replace(/\.docx$/i, '.pdf')}`,
                ),
            ),
    };
    return new DocumentBuildService(
        offerCore as unknown as OfferWordCoreGenerateService,
        invoiceCore as unknown as InvoiceWordCoreGenerateService,
        pdfExport as unknown as OfferWordPdfExportService,
    );
};

describe('DocumentBuildService: имена на Диске', () => {
    it('КП — «КП_<комплект>_<доступ>», файл PDF на сервере прежний', async () => {
        const result = await setup('311-5527').build(request());

        expect(result.offer.diskName).toBe('КП_Гарант-Юрист_Интернет_1_ОД');
        expect(result.offer.name).toBe('КП Гарант-Юрист - Интернет 1 ОД');
        expect(result.offer.absolutePath).toBe('/storage/offer-1b2c.pdf');
    });

    it('счёт с номером — «Счёт_<номер>»', async () => {
        const result = await setup('311-5527').build(request());

        expect(result.invoices).toHaveLength(1);
        expect(result.invoices[0].diskName).toBe('Счёт_311-5527');
        expect(result.invoices[0].absolutePath).toBe(
            '/storage/invoice-9f8e.pdf',
        );
    });

    it('счёт без номера — по комплекту и доступу набора', async () => {
        const result = await setup('').build(request());

        expect(result.invoices[0].diskName).toBe(
            'Счёт_Гарант-Юрист_Интернет_1_ОД',
        );
    });

    it('Word: DOCX остаётся DOCX, имя то же', async () => {
        const result = await setup('15').build(request({ isWord: true }));

        expect(result.offer.diskName).toBe('КП_Гарант-Юрист_Интернет_1_ОД');
        expect(result.offer.absolutePath).toBe('/storage/offer-1b2c.docx');
        expect(result.invoices[0].absolutePath).toBe(
            '/storage/invoice-9f8e.docx',
        );
    });
});
