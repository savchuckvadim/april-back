import { Injectable } from '@nestjs/common';
import { WordTemplate } from '@/modules/offer-template/word';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordPdfExportService } from '../services/pdf-export/offer-word-pdf-export.service';
import { InnerDealService } from '@/modules/inner-deal/services/inner-deal.service';
import { OfferWordCoreGenerateResult } from '../types/offer-word-core-generate.types';
import dayjs from 'dayjs';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { InvoiceWordCoreGenerateService } from '../services/invoice-word-core/invoice-word-core-generate.service';
import { IResultDocumentLink } from '../interface/document.interface';
import { OfferBxTimelineService } from '../services/bitrix/offer-bx-timeline.service';
import { getInvoiceDocumentProductName } from '../lib/get-invoice-document-product-name';
import { getOfferDocumentProductName } from '../lib/get-offer-document-product-name.util';

/**
 * Синхронный сценарий «как generateOfferWord»: ядро пишет DOCX (+ссылка),
 * здесь решается Word vs PDF, публичная ссылка на итог и запись шаблона в сделку.
 */
@Injectable()
export class OfferWordByTemplateGenerateUseCase {
    constructor(
        private readonly offerWordCoreGenerate: OfferWordCoreGenerateService,
        private readonly offerWordPdfExportService: OfferWordPdfExportService,
        private readonly innerDealService: InnerDealService,
        private readonly invoiceGenerateService: InvoiceWordCoreGenerateService,
        private readonly timelineService: OfferBxTimelineService,
    ) {}

    async execute(dto: OfferWordByTemplateGenerateDto): Promise<{
        template: WordTemplate;
        link: IResultDocumentLink;
        renderData: OfferWordCoreGenerateResult['renderData'];
        invoiceLinks: IResultDocumentLink[];
    }> {
        const dealId = Number(dto.dealId);
        const domain = dto.domain;
        const userId = dto.userId;
        const templateId = BigInt(dto.templateId);
        const isPdf = !dto.isWord;
        const core = await this.offerWordCoreGenerate.execute(dto, {
            publishDocxLink: true,
        });
        const year = dayjs().format('YYYY');
        const offerLink: IResultDocumentLink = await this.prepareOfferLink(
            dto,
            core,
            domain,
            userId,
            year,
            isPdf,
        );
        let invoiceLinks: IResultDocumentLink[] = [];

        if (dto.invoice.needGeneralInvoice || dto.invoice.needManyInvoices) {
            try {
                invoiceLinks = await this.getInvoiceLinks(dto, year, isPdf);
            } catch (error) {
                console.error('Error in getInvoiceLinks:', error);
            }
        }

        try {
            await this.innerDealService.setOfferTemplateByDomainAndDealId(
                domain,
                dealId,
                templateId,
            );
        } catch (error) {
            console.error('Error in setOfferTemplateByDomainAndDealId:', error);
        }

        await this.timelineService.sendDocumentToBitrix({
            domain: domain,
            companyId: dto.companyId,
            userId: userId,
            documents: [offerLink, ...invoiceLinks],
            dealId: dealId.toString(),
        });

        return {
            template: core.template,
            link: offerLink,
            renderData: core.renderData,
            invoiceLinks,
        };
    }

    private async prepareOfferLink(
        dto: OfferWordByTemplateGenerateDto,
        core: OfferWordCoreGenerateResult,
        domain: string,
        userId: number,
        year: string,
        isPdf: boolean,
    ): Promise<IResultDocumentLink> {
        const documentName = getOfferDocumentProductName(dto);
        console.log('documentName', documentName);
        let link: string;
        if (isPdf) {
            link = await this.offerWordPdfExportService.buildPublicPdfLink({
                docxAbsolutePath: core.docxPath,
                docxFileName: core.resultFileName,
                domain: domain,
                userId: userId,
                year,
            });
            // DOCX уже прочитан конвертером; для сценария «нужен только PDF» файл не храним.
            await this.offerWordCoreGenerate.removeSavedDocx(core.docxPath);
        } else {
            link = core.docxLink as string;
        }

        return {
            link,
            name: documentName,
            type: 'offer',
        };
    }
    protected async getInvoiceLinks(
        dto: OfferWordByTemplateGenerateDto,
        year: string,
        isPdf: boolean,
    ): Promise<IResultDocumentLink[]> {
        const domain = dto.domain;
        const userId = dto.userId;
        const invoiceCoreResult =
            await this.invoiceGenerateService.execute(dto);
        const savedResults = invoiceCoreResult.savedResults;
        const invoiceLinks: IResultDocumentLink[] = [];
        let isAlternative = false;
        let invoiceCount = 0;
        for (const result of savedResults) {
            // берем name из результатов
            // берем link из результатов docx - если не нужен pdf, то используем docxLink
            let link: string = result.docxLink;

            if (isPdf) {
                // если нужен pdf, то генерируем pdf и используем link из pdf
                link = await this.offerWordPdfExportService.buildPublicPdfLink({
                    docxAbsolutePath: result.docxPath,
                    docxFileName: result.resultFileName,
                    domain: domain,
                    userId: userId,
                    year,
                });
                // удаляем docx после генерации pdf
                await this.invoiceGenerateService.removeSavedDocx(
                    result.docxPath,
                );
            }

            // вне зависимости от того, нужен ли pdf, добавляем в массив ссылки на документы
            // и имя документа
            const invoiceName = getInvoiceDocumentProductName(
                dto,
                isAlternative,
                invoiceCount,
            );
            invoiceLinks.push({
                link,
                name: invoiceName,
                type: 'invoice',
            });

            isAlternative = true;
            invoiceCount++;
        }
        return invoiceLinks;
    }
}
