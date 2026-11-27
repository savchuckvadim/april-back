import { Injectable, Logger } from '@nestjs/common';
import { IPreparedDocument } from '../../interface/document.interface';
import { getInvoiceDocumentProductName } from '../../lib/get-invoice-document-product-name';
import { getInvoiceDiskName } from '../../lib/document-disk-name.util';
import { InvoiceBuildRequest } from '../../types/invoice-build-request.type';
import { OfferWordPdfExportService } from '../pdf-export/offer-word-pdf-export.service';
import { InvoiceWordCoreGenerateService } from './invoice-word-core-generate.service';

/** Как собирать документы счетов. */
export interface InvoiceDocumentsBuildOptions {
    /** Год папки хранилища и публичных ссылок, четыре цифры. */
    year: string;
    /** Переводить DOCX счетов в PDF; сбой перевода оставляет DOCX. */
    isPdf: boolean;
    /**
     * Сколько счетов этой генерации уже выпущено прежними вызовами: сквозной
     * сдвиг номера, чтобы счета разных договоров одной генерации не повторяли
     * номер (первый счёт N, следующие N-1, N-2…).
     */
    numberOffset?: number;
}

export interface InvoiceDocumentsBuildResult {
    /** Готовые документы счетов, по одному на набор. Пусто, когда счёт не построен. */
    documents: IPreparedDocument[];
    /** Заполнено, когда счёт не построен: причина для менеджера (нет шаблона). */
    notBuiltReason?: string;
}

/**
 * Сборка документов счетов: шаблон подбирает InvoiceTemplateSourceService
 * (по домену, поставщику, типу клиента и виду поставки), DOCX рендерит
 * InvoiceWordCoreGenerateService, перевод в PDF — OfferWordPdfExportService
 * (сбой перевода оставляет DOCX).
 *
 * Общий путь Word-КП (multi-build) и PDF-КП: у разных поставщиков разные
 * формы счёта, и обоим форматам счёт нужен один и тот же.
 */
@Injectable()
export class InvoiceDocumentsBuildService {
    private readonly logger = new Logger(InvoiceDocumentsBuildService.name);

    constructor(
        private readonly invoiceGenerateService: InvoiceWordCoreGenerateService,
        private readonly pdfExportService: OfferWordPdfExportService,
    ) {}

    async build(
        dto: InvoiceBuildRequest,
        options: InvoiceDocumentsBuildOptions,
    ): Promise<InvoiceDocumentsBuildResult> {
        const { year, isPdf, numberOffset = 0 } = options;
        const invoiceCoreResult = await this.invoiceGenerateService.execute(
            dto,
            { numberOffset },
        );
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

            results.push({
                link: serverLink,
                // имя — по набору, из которого собран счёт
                name: getInvoiceDocumentProductName(
                    dto,
                    saved.setKind,
                    saved.setIndex,
                    results.length,
                ),
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

        return {
            documents: results,
            ...(invoiceCoreResult.notBuiltReason
                ? { notBuiltReason: invoiceCoreResult.notBuiltReason }
                : {}),
        };
    }
}
