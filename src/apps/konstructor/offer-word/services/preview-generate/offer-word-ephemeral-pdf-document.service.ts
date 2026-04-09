import { Injectable } from '@nestjs/common';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { OfferWordCoreGenerateService } from '../offer-word-core/offer-word-core-generate.service';
import { OfferWordPdfExportService } from '../pdf-export/offer-word-pdf-export.service';
import { StorageService } from '@/core/storage';
import { InnerDealService } from '@/modules/inner-deal/services/inner-deal.service';

/**
 * Эфемерный сценарий: ядро без публичной ссылки на DOCX → PDF в память → оба файла с диска удалены.
 * Запись шаблона в сделку — на этом же уровне (как в старом generateEphemeralPdfBuffer).
 */
@Injectable()
export class OfferWordEphemeralPdfDocumentService {
    constructor(
        private readonly offerWordCoreGenerate: OfferWordCoreGenerateService,
        private readonly offerWordPdfExportService: OfferWordPdfExportService,
        private readonly storageService: StorageService,
        private readonly innerDealService: InnerDealService,
    ) {}

    async buildPdfBufferRemovingFiles(
        dto: OfferWordByTemplateGenerateDto,
    ): Promise<{ pdfBuffer: Buffer; pdfFileName: string }> {
        const dealId = Number(dto.dealId);
        const domain = dto.domain;
        const templateId = BigInt(dto.templateId);

        const core = await this.offerWordCoreGenerate.execute(dto, {
            publishDocxLink: false,
        });

        const pdfFileName = core.resultFileName.replace(/\.docx$/i, '.pdf');
        let pdfPath: string | null = null;
        try {
            pdfPath = await this.offerWordPdfExportService.convertDocxToPdfPath(
                core.docxPath,
            );
        } finally {
            await this.safeUnlink(core.docxPath);
        }

        let pdfBuffer: Buffer;
        try {
            pdfBuffer = await this.storageService.readFile(pdfPath);
        } finally {
            await this.safeUnlink(pdfPath);
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

        return { pdfBuffer, pdfFileName };
    }

    private async safeUnlink(filePath: string | null): Promise<void> {
        if (!filePath) {
            return;
        }
        try {
            if (await this.storageService.fileExists(filePath)) {
                await this.storageService.deleteFile(filePath);
            }
        } catch {
            /* ignore */
        }
    }
}
