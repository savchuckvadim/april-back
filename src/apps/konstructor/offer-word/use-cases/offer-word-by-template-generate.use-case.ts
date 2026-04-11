import { Injectable } from '@nestjs/common';
import { WordTemplate } from '@/modules/offer-template/word';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { InnerDealService } from '@/modules/inner-deal/services/inner-deal.service';
import { OfferWordCoreGenerateResult } from '../types/offer-word-core-generate.types';
import { IResultDocumentLink } from '../interface/document.interface';
import { OfferBxTimelineService } from '../services/bitrix/offer-bx-timeline.service';
import { BitrixDocumentSaveFlowService } from '../services/bitrix/bitrix-document-save-flow.service';
import { DocumentBuildService } from '../services/document-build.service';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { OfferTemplateService } from '@/modules/offer-template/offer-template';

@Injectable()
export class OfferWordByTemplateGenerateUseCase {
    constructor(
        private readonly documentBuildService: DocumentBuildService,
        private readonly innerDealService: InnerDealService,
        private readonly timelineService: OfferBxTimelineService,
        private readonly bxDocumentSaveFlowService: BitrixDocumentSaveFlowService,
        private readonly offerWordCoreGenerate: OfferWordCoreGenerateService,
        private readonly offerTemplateService: OfferTemplateService, // для инкремента счетчика шаблона
    ) {}

    async execute(dto: OfferWordByTemplateGenerateDto): Promise<{
        template: WordTemplate;
        link: IResultDocumentLink;
        renderData: OfferWordCoreGenerateResult['renderData'];
        invoiceLinks: IResultDocumentLink[];
        portalFolderId: number;
    }> {
        const dealId = Number(dto.dealId);
        const domain = dto.domain;
        const onlyBitrixSave = Boolean(dto.onlyBitrixSave) || true;

        const buildResult = await this.documentBuildService.build(dto);
        const allDocuments = [buildResult.offer, ...buildResult.invoices];

        await this.saveTemplateInDeal(domain, dealId, dto.templateId);

        const saveResult = await this.bxDocumentSaveFlowService.saveDocuments({
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
            // files: onlyBitrixSave ? saveResult.files : undefined,
        });

        if (onlyBitrixSave) {
            await this.cleanupLocalFiles(allDocuments.map(d => d.absolutePath));
        }

        const finalOffer =
            saveResult.documents.find(d => d.type === 'offer') ||
            buildResult.offer;
        const finalInvoices = saveResult.documents.filter(
            d => d.type === 'invoice',
        );

        await this.offerTemplateService.incrementTemplateCounter(
            BigInt(dto.templateId),
        );

        return {
            template: buildResult.template,
            link: finalOffer,
            renderData: buildResult.renderData,
            invoiceLinks: finalInvoices,
            portalFolderId: saveResult.portalFolderId || 0,
        };
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
