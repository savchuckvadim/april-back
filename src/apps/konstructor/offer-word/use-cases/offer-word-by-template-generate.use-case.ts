import { Injectable } from '@nestjs/common';
import { WordTemplate } from '@/modules/offer-template/word';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordPdfExportService } from '../services/pdf-export/offer-word-pdf-export.service';
import { InnerDealService } from '@/modules/inner-deal/services/inner-deal.service';
import { OfferWordCoreGenerateResult } from '../types/offer-word-core-generate.types';
import dayjs from 'dayjs';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { InvoiceWordCoreGenerateService } from '../services/invoice-word-core/invoice-word-core-generate.service';

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
    ) {}

    async execute(dto: OfferWordByTemplateGenerateDto): Promise<{
        template: WordTemplate;
        link: string;
        renderData: OfferWordCoreGenerateResult['renderData'];
        invoiceLinks: string[];
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
        let link: string;
        let invoiceLinks: string[] = [];
        if (isPdf) {
            link = await this.offerWordPdfExportService.buildPublicPdfLink({
                docxAbsolutePath: core.docxPath,
                docxFileName: core.resultFileName,
                domain: dto.domain,
                userId: userId,
                year,
            });
            // DOCX уже прочитан конвертером; для сценария «нужен только PDF» файл не храним.
            await this.offerWordCoreGenerate.removeSavedDocx(core.docxPath);
        } else {
            link = core.docxLink as string;
        }
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

        return {
            template: core.template,
            link,
            renderData: core.renderData,
            invoiceLinks,
        };
    }

    protected async getInvoiceLinks(
        dto: OfferWordByTemplateGenerateDto,
        year: string,
        isPdf: boolean,
    ): Promise<string[]> {
        const domain = dto.domain;
        const userId = dto.userId;
        const invoiceCoreResult =
            await this.invoiceGenerateService.execute(dto);
        const savedResults = invoiceCoreResult.savedResults;
        const invoiceLinks: string[] = [];
        if (isPdf) {
            for (const result of savedResults) {
                const link =
                    await this.offerWordPdfExportService.buildPublicPdfLink({
                        docxAbsolutePath: result.docxPath,
                        docxFileName: result.resultFileName,
                        domain: domain,
                        userId: userId,
                        year,
                    });

                invoiceLinks.push(link);
                await this.invoiceGenerateService.removeSavedDocx(
                    result.docxPath,
                );
            }
        } else {
            for (const result of savedResults) {
                invoiceLinks.push(result.docxLink);
            }
        }
        return invoiceLinks;
    }
}
