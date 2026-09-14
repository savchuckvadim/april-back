import { Injectable } from '@nestjs/common';
import { InnerDealService } from '@app/konstructor/modules/inner-deal/services/inner-deal.service';
import { OfferTemplateService } from '@app/konstructor/modules/offer-template/offer-template';
import { OfferBxTimelineService } from '../../services/bitrix/offer-bx-timeline.service';
import { BitrixDocumentSaveFlowService } from '../../services/bitrix/bitrix-document-save-flow.service';
import { OfferWordCoreGenerateService } from '../../services/offer-word-core/offer-word-core-generate.service';
import { OfferWordMultiBuildService } from '../services/offer-word-multi-build.service';
import {
    OfferWordMultiGenerateDto,
    OfferWordMultiGenerateResultDto,
} from '../dto/offer-word-multi-generate.dto';

/**
 * Генерация КП v2: собрать документы участников, сохранить в Битрикс,
 * отписаться в таймлайн, почистить локальные файлы. Логика та же, что у
 * старого use-case, но старый не импортируется: две версии живут независимо,
 * чтобы старую можно было удалить, не задев новую.
 */
@Injectable()
export class OfferWordMultiGenerateUseCase {
    constructor(
        private readonly buildService: OfferWordMultiBuildService,
        private readonly innerDealService: InnerDealService,
        private readonly timelineService: OfferBxTimelineService,
        private readonly bxDocumentSaveFlowService: BitrixDocumentSaveFlowService,
        private readonly offerWordCoreGenerate: OfferWordCoreGenerateService,
        private readonly offerTemplateService: OfferTemplateService,
    ) {}

    async execute(
        dto: OfferWordMultiGenerateDto,
    ): Promise<OfferWordMultiGenerateResultDto> {
        const dealId = Number(dto.dealId);
        const domain = dto.domain;
        // как и в старом пути: документы живут только на Bitrix Disk
        const onlyBitrixSave = Boolean(dto.onlyBitrixSave) || true;

        try {
            const buildResult = await this.buildService.build(dto);
            // КП может быть несколько (по участнику) — в Битрикс уходят все
            const allDocuments = [
                ...buildResult.offers,
                ...buildResult.invoices,
            ];

            await this.saveTemplateInDeal(domain, dealId, dto.templateId);

            const saveResult =
                await this.bxDocumentSaveFlowService.saveDocuments({
                    domain,
                    companyId: dto.companyId,
                    userId: dto.userId,
                    dealId: dealId.toString(),
                    documents: allDocuments,
                    onlyBitrixSave,
                });

            await this.timelineService.sendDocumentToBitrix({
                domain,
                companyId: dto.companyId,
                userId: dto.userId,
                documents: saveResult.documents,
                dealId: dealId.toString(),
            });

            if (onlyBitrixSave) {
                await this.cleanupLocalFiles(
                    allDocuments.map(document => document.absolutePath),
                );
            }

            const savedOffers = saveResult.documents.filter(
                document => document.type === 'offer',
            );
            const finalOffers = savedOffers.length
                ? savedOffers
                : buildResult.offers;
            const finalInvoices = saveResult.documents.filter(
                document => document.type === 'invoice',
            );

            await this.offerTemplateService.incrementTemplateCounter(
                BigInt(dto.templateId),
            );

            return {
                template: buildResult.template,
                link: finalOffers[0],
                links: finalOffers,
                renderData: buildResult.renderData,
                invoiceLinks: finalInvoices,
                portalFolderId: saveResult.portalFolderId || 0,
                warnings: buildResult.warnings,
            };
        } catch (error) {
            await this.timelineService.sendErrorToBitrix({
                domain,
                companyId: dto.companyId,
                userId: dto.userId,
                documents: [],
                dealId: dealId.toString(),
            });
            throw error;
        }
    }

    private async saveTemplateInDeal(
        domain: string,
        dealId: number,
        templateId: string,
    ): Promise<void> {
        try {
            await this.innerDealService.setOfferTemplateByDomainAndDealId(
                domain,
                dealId,
                BigInt(templateId),
            );
        } catch (error) {
            // шаблон в сделке — удобство, а не часть документа: генерацию не роняем
            console.error('Error in setOfferTemplateByDomainAndDealId:', error);
        }
    }

    private async cleanupLocalFiles(paths: string[]): Promise<void> {
        const uniquePaths = [...new Set(paths)];
        for (const filePath of uniquePaths) {
            await this.offerWordCoreGenerate.removeSavedDocx(filePath);
        }
    }
}
