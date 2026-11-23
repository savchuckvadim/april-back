import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { StorageService } from '@lib/core/storage';
import { InnerDealService } from '@app/konstructor/modules/inner-deal/services/inner-deal.service';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import {
    SupplyEnrichMemo,
    SupplyPayloadEnricherService,
} from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { OfferWordPdfPreviewRequestDto } from '../../dto/offer-word-pdf-preview-request.dto';
import { planOfferRenders } from '../../multi/lib/variants/plan-offer-renders';
import { resolveDocumentVariants } from '../../multi/lib/variants/resolve-document-variants';
import { OfferWordCoreGenerateService } from '../offer-word-core/offer-word-core-generate.service';
import { OfferWordPdfExportService } from '../pdf-export/offer-word-pdf-export.service';
import { PdfMergeService } from '../pdf-export/pdf-merge.service';

/** Текст отмены тот же, что у процессора превью. */
const CANCELLED_MESSAGE = 'Операция отменена клиентом';

interface RenderedPdf {
    /** PDF лежит на диске: удаляет тот, кто его заказал. */
    pdfPath: string;
    pdfFileName: string;
}

/**
 * Эфемерный сценарий: ядро без публичной ссылки на DOCX → PDF в память → все файлы с диска удалены.
 * Запись шаблона в сделку — на этом же уровне (как в старом generateEphemeralPdfBuffer).
 *
 * Что печатать, решает тот же план, что у формирования КП v2
 * (`planOfferRenders`): превью показывает документ, который получит менеджер.
 * Участники комплекта в превью — это один PDF-файл: при независимых
 * участниках PDF каждого склеиваются в один. Счёт не строится, стадии
 * вариантов, Диск и таймлайн превью не трогает.
 */
@Injectable()
export class OfferWordEphemeralPdfDocumentService {
    private readonly logger = new Logger(
        OfferWordEphemeralPdfDocumentService.name,
    );

    constructor(
        private readonly offerWordCoreGenerate: OfferWordCoreGenerateService,
        private readonly offerWordPdfExportService: OfferWordPdfExportService,
        private readonly pdfMergeService: PdfMergeService,
        private readonly storageService: StorageService,
        private readonly innerDealService: InnerDealService,
        private readonly supplyEnricher: SupplyPayloadEnricherService,
    ) {}

    /**
     * @param signal прерывает конвертацию, если клиент отменил операцию:
     * слот пула освобождается сразу, файлы всё равно вычищаются.
     */
    async buildPdfBufferRemovingFiles(
        input: OfferWordPdfPreviewRequestDto,
        signal?: AbortSignal,
    ): Promise<{ pdfBuffer: Buffer; pdfFileName: string }> {
        // Подписи поставок — те же, что в КП: у верха запроса и у каждого варианта
        const dto = await this.enrichWithVariants(input);
        const dealId = Number(dto.dealId);
        const domain = dto.domain;
        const templateId = BigInt(dto.templateId);

        // режим печати и запросы на рендер — как у формирования КП
        const plan = planOfferRenders(dto, resolveDocumentVariants(dto));
        if (plan.warnings.length) {
            this.logger.warn(`${domain}: ${plan.warnings.join('; ')}`);
        }

        const { pdfBuffer, pdfFileName } = await this.renderPlanToBuffer(
            dto,
            plan.requests,
            signal,
        );

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

    /**
     * Подписи поставок у верха запроса и у каждого варианта. Одна память на
     * запрос держит число обращений к справочнику равным числу разных
     * поставок.
     */
    private async enrichWithVariants(
        input: OfferWordPdfPreviewRequestDto,
    ): Promise<OfferWordPdfPreviewRequestDto> {
        const memo: SupplyEnrichMemo = new Map();
        const top = await this.supplyEnricher.enrichPayload(input, memo);
        if (!input.variants) return top;

        const variants: DocumentVariantDto[] = [];
        for (const variant of input.variants) {
            variants.push(
                await this.supplyEnricher.enrichPayload(variant, memo),
            );
        }
        return { ...top, variants };
    }

    /**
     * Один запрос — его PDF. Несколько (независимые участники) — PDF каждого,
     * склеенные в один файл. Все файлы на диске удаляются, чем бы ни кончилась
     * сборка.
     */
    private async renderPlanToBuffer(
        dto: OfferWordPdfPreviewRequestDto,
        requests: readonly OfferWordByTemplateGenerateDto[],
        signal?: AbortSignal,
    ): Promise<{ pdfBuffer: Buffer; pdfFileName: string }> {
        const rendered: RenderedPdf[] = [];
        let mergedPath: string | null = null;
        try {
            for (const request of requests) {
                if (signal?.aborted) {
                    throw new Error(CANCELLED_MESSAGE);
                }
                rendered.push(await this.renderPdfFile(request, signal));
            }

            if (rendered.length === 1) {
                const [single] = rendered;
                return {
                    pdfBuffer: await this.storageService.readFile(
                        single.pdfPath,
                    ),
                    pdfFileName: single.pdfFileName,
                };
            }

            const merged = await this.mergeRenderedPdfs(dto, rendered);
            mergedPath = merged.absolutePath;
            return {
                pdfBuffer: await this.storageService.readFile(mergedPath),
                pdfFileName: merged.fileName,
            };
        } finally {
            for (const item of rendered) {
                await this.safeUnlink(item.pdfPath);
            }
            await this.safeUnlink(mergedPath);
        }
    }

    /** DOCX → PDF на диске; DOCX удаляется сразу, как PDF готов или сборка упала. */
    private async renderPdfFile(
        request: OfferWordByTemplateGenerateDto,
        signal?: AbortSignal,
    ): Promise<RenderedPdf> {
        const core = await this.offerWordCoreGenerate.execute(request, {
            publishDocxLink: false,
        });

        const pdfFileName = core.resultFileName.replace(/\.docx$/i, '.pdf');
        try {
            const pdfPath =
                await this.offerWordPdfExportService.convertDocxToPdfPath(
                    core.docxPath,
                    signal,
                );
            return { pdfPath, pdfFileName };
        } finally {
            await this.safeUnlink(core.docxPath);
        }
    }

    /**
     * Превью отдаёт один файл, поэтому при сбое склейки отдельных документов
     * у него нет: операция завершается ошибкой с понятным текстом.
     */
    private async mergeRenderedPdfs(
        dto: OfferWordPdfPreviewRequestDto,
        rendered: readonly RenderedPdf[],
    ): Promise<{ absolutePath: string; fileName: string }> {
        try {
            return await this.pdfMergeService.merge({
                pdfAbsolutePaths: rendered.map(item => item.pdfPath),
                domain: dto.domain,
                userId: dto.userId,
                year: dayjs().format('YYYY'),
            });
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : String(error);
            this.logger.error(
                `${dto.domain}: превью не склеилось (${rendered.length} PDF) — ${reason}`,
            );
            throw new Error(
                `Не удалось склеить PDF вариантов для превью: ${reason}`,
            );
        }
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
