import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordCoreGenerateService } from './offer-word-core/offer-word-core-generate.service';
import { InvoiceWordCoreGenerateService } from './invoice-word-core/invoice-word-core-generate.service';
import { OfferWordPdfExportService } from './pdf-export/offer-word-pdf-export.service';
import { IPreparedDocument } from '../interface/document.interface';
import { OfferWordCoreGenerateResult } from '../types/offer-word-core-generate.types';
import { getOfferDocumentProductName } from '../lib/get-offer-document-product-name.util';
import { getInvoiceDocumentProductName } from '../lib/get-invoice-document-product-name';
import {
    getInvoiceDiskName,
    getOfferDiskName,
} from '../lib/document-disk-name.util';
import {
    describeInvoiceNotBuilt,
    getErrorReason,
} from '../lib/invoice-not-built.util';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';

export interface IDocumentBuildResult {
    template: WordTemplate;
    renderData: OfferWordCoreGenerateResult['renderData'];
    offer: IPreparedDocument;
    invoices: IPreparedDocument[];
}

@Injectable()
export class DocumentBuildService {
    private readonly logger = new Logger(DocumentBuildService.name);

    constructor(
        private readonly offerWordCoreGenerate: OfferWordCoreGenerateService,
        private readonly invoiceGenerateService: InvoiceWordCoreGenerateService,
        private readonly pdfExportService: OfferWordPdfExportService,
    ) {}

    async build(
        dto: OfferWordByTemplateGenerateDto,
    ): Promise<IDocumentBuildResult> {
        const isPdf = !dto.isWord;
        const core = await this.offerWordCoreGenerate.execute(dto, {
            publishDocxLink: true,
        });
        const year = dayjs().format('YYYY');

        const offer = await this.buildOfferDocument(dto, core, year, isPdf);

        let invoices: IPreparedDocument[] = [];
        try {
            if (
                dto.invoice.needGeneralInvoice ||
                dto.invoice.needManyInvoices
            ) {
                invoices = await this.buildInvoiceDocuments(dto, year, isPdf);
            }
        } catch (error) {
            // счёт — дополнение к КП: без него КП всё равно отдаём
            this.logger.error(
                `${dto.domain}: ${describeInvoiceNotBuilt(getErrorReason(error))}`,
            );
        }

        return {
            template: core.template,
            renderData: core.renderData,
            offer,
            invoices,
        };
    }

    private async buildOfferDocument(
        dto: OfferWordByTemplateGenerateDto,
        core: OfferWordCoreGenerateResult,
        year: string,
        isPdf: boolean,
    ): Promise<IPreparedDocument> {
        const displayName = getOfferDocumentProductName(dto);
        let serverLink: string;
        let absolutePath: string;

        if (isPdf) {
            try {
                serverLink = await this.pdfExportService.buildPublicPdfLink({
                    docxAbsolutePath: core.docxPath,
                    docxFileName: core.resultFileName,
                    domain: dto.domain,
                    userId: dto.userId,
                    year,
                    type: 'offer',
                });
                absolutePath = core.docxPath.replace(/\.docx$/i, '.pdf');
            } catch (error) {
                this.logger.warn(
                    'PDF conversion failed, falling back to DOCX',
                    (error as Error)?.message,
                );
                serverLink = core.docxLink as string;
                absolutePath = core.docxPath;
            }
        } else {
            serverLink = core.docxLink as string;
            absolutePath = core.docxPath;
        }

        return {
            link: serverLink,
            name: displayName,
            type: 'offer',
            diskName: getOfferDiskName(dto),
            absolutePath,
        };
    }

    private async buildInvoiceDocuments(
        dto: OfferWordByTemplateGenerateDto,
        year: string,
        isPdf: boolean,
    ): Promise<IPreparedDocument[]> {
        const invoiceCoreResult =
            await this.invoiceGenerateService.execute(dto);
        if (invoiceCoreResult.notBuiltReason) {
            this.logger.warn(
                `${dto.domain}: ${describeInvoiceNotBuilt(invoiceCoreResult.notBuiltReason)}`,
            );
        }
        const results: IPreparedDocument[] = [];

        for (const saved of invoiceCoreResult.savedResults) {
            let serverLink: string = saved.docxLink;
            let absolutePath: string = saved.docxPath;

            if (isPdf) {
                try {
                    serverLink = await this.pdfExportService.buildPublicPdfLink(
                        {
                            docxAbsolutePath: saved.docxPath,
                            docxFileName: saved.resultFileName,
                            domain: dto.domain,
                            userId: dto.userId,
                            year,
                            type: 'invoice',
                        },
                    );
                    absolutePath = saved.docxPath.replace(/\.docx$/i, '.pdf');
                } catch (error) {
                    this.logger.warn(
                        'PDF invoice conversion failed, falling back to DOCX',
                        (error as Error)?.message,
                    );
                }
            }

            // имя — по набору, из которого собран счёт
            const displayName = getInvoiceDocumentProductName(
                dto,
                saved.setKind,
                saved.setIndex,
                results.length,
            );
            results.push({
                link: serverLink,
                name: displayName,
                type: 'invoice',
                // на Диске счёт называется по номеру, нет номера — по комплекту;
                // номер читается осторожно: имя файла не должно ронять сборку счёта
                diskName: getInvoiceDiskName(
                    dto,
                    saved.setKind,
                    saved.setIndex,
                    saved.renderData?.InvoiceNumber,
                    results.length,
                ),
                absolutePath,
            });
        }

        return results;
    }
}
