import { Injectable, Logger } from '@nestjs/common';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { InnerDealService } from '@app/konstructor/modules/inner-deal/services/inner-deal.service';
import { OfferWordCoreGenerateResult } from '../types/offer-word-core-generate.types';
import { IResultDocumentLink } from '../interface/document.interface';
import { OfferBxTimelineService } from '../services/bitrix/offer-bx-timeline.service';
import { BitrixDocumentSaveFlowService } from '../services/bitrix/bitrix-document-save-flow.service';
import { DocumentBuildService } from '../services/document-build.service';
import { OfferWordCoreGenerateService } from '../services/offer-word-core/offer-word-core-generate.service';
import { OfferTemplateService } from '@app/konstructor/modules/offer-template/offer-template';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import {
    describeOfferFailure,
    inOfferStep,
    OFFER_GENERATION_STEP,
} from '../lib/offer-generation-failure.util';

@Injectable()
export class OfferWordByTemplateGenerateUseCase {
    private readonly logger = new Logger(
        OfferWordByTemplateGenerateUseCase.name,
    );

    constructor(
        private readonly documentBuildService: DocumentBuildService,
        private readonly innerDealService: InnerDealService,
        private readonly timelineService: OfferBxTimelineService,
        private readonly bxDocumentSaveFlowService: BitrixDocumentSaveFlowService,
        private readonly offerWordCoreGenerate: OfferWordCoreGenerateService,
        private readonly offerTemplateService: OfferTemplateService, // для инкремента счетчика шаблона
        private readonly supplyEnricher: SupplyPayloadEnricherService,
    ) {}

    async execute(input: OfferWordByTemplateGenerateDto): Promise<{
        template: WordTemplate;
        link: IResultDocumentLink;
        renderData: OfferWordCoreGenerateResult['renderData'];
        invoiceLinks: IResultDocumentLink[];
        portalFolderId: number;
    }> {
        const dealId = Number(input.dealId);
        const domain = input.domain;
        const onlyBitrixSave = Boolean(input.onlyBitrixSave) || true;

        try {
            // Подписи поставок для КП и счёта (supply, rows, total, sets) — с бэка
            // по code (легаси-тексты сильнее).
            const dto: OfferWordByTemplateGenerateDto = await inOfferStep(
                OFFER_GENERATION_STEP.build,
                () => this.supplyEnricher.enrichPayload(input),
            );
            const buildResult = await inOfferStep(
                OFFER_GENERATION_STEP.build,
                () => this.documentBuildService.build(dto),
            );
            const allDocuments = [buildResult.offer, ...buildResult.invoices];

            await this.saveTemplateInDeal(domain, dealId, dto.templateId);

            const saveResult = await inOfferStep(
                OFFER_GENERATION_STEP.upload,
                () =>
                    this.bxDocumentSaveFlowService.saveDocuments({
                        domain,
                        companyId: dto.companyId,
                        userId: dto.userId,
                        dealId: dealId.toString(),
                        documents: allDocuments,
                        onlyBitrixSave,
                    }),
            );

            await inOfferStep(OFFER_GENERATION_STEP.timeline, () =>
                this.timelineService.sendDocumentToBitrix({
                    domain,
                    companyId: dto.companyId,
                    userId: dto.userId,
                    documents: saveResult.documents,
                    dealId: dealId.toString(),
                    // files: onlyBitrixSave ? saveResult.files : undefined,
                }),
            );

            // документы уже в сделке: дальше сбой не отменяет генерацию
            return await inOfferStep(OFFER_GENERATION_STEP.finish, async () => {
                if (onlyBitrixSave) {
                    await this.cleanupLocalFiles(
                        allDocuments.map(d => d.absolutePath),
                    );
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
            });
        } catch (error) {
            await this.reportFailure(error, input, dealId);
            throw error;
        }
    }

    /**
     * Причина сбоя — комментарием в сделку. Сбой самого комментария
     * исходную ошибку не подменяет: наверх уходит то, что случилось с КП.
     */
    private async reportFailure(
        error: unknown,
        input: OfferWordByTemplateGenerateDto,
        dealId: number,
    ): Promise<void> {
        try {
            await this.timelineService.sendErrorToBitrix({
                domain: input.domain,
                companyId: input.companyId,
                userId: input.userId,
                dealId: dealId.toString(),
                reason: describeOfferFailure(error).comment,
            });
        } catch (sendError) {
            this.logger.warn(
                `${input.domain}: комментарий о сбое КП не записан в сделку ${dealId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
            );
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
