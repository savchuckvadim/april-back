import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { OfferWordCoreGenerateService } from '../../services/offer-word-core/offer-word-core-generate.service';
import { InvoiceWordCoreGenerateService } from '../../services/invoice-word-core/invoice-word-core-generate.service';
import { OfferWordPdfExportService } from '../../services/pdf-export/offer-word-pdf-export.service';
import { PdfMergeService } from '../../services/pdf-export/pdf-merge.service';
import { IPreparedDocument } from '../../interface/document.interface';
import { OfferWordCoreGenerateResult } from '../../types/offer-word-core-generate.types';
import { getOfferDocumentProductName } from '../../lib/get-offer-document-product-name.util';
import { getInvoiceDocumentProductName } from '../../lib/get-invoice-document-product-name';
import { OfferWordMultiGenerateDto } from '../dto/offer-word-multi-generate.dto';
import {
    DocumentVariantsMode,
    resolveDocumentVariants,
    ResolvedDocumentVariants,
} from '../lib/variants/resolve-document-variants';
import { mergeDocumentVariants } from '../lib/variants/merge-document-variants';
import {
    groupVariantsByContractType,
    withVariant,
} from '../lib/variants/with-variant';
import { withComparisonSets } from '../lib/variants/with-comparison-sets';

export interface IOfferWordMultiBuildResult {
    template: WordTemplate;
    renderData: OfferWordCoreGenerateResult['renderData'];
    /** Главный документ КП (в independent-режиме PDF — склейка страниц). */
    offer: IPreparedDocument;
    /**
     * Все документы КП. Обычно один; в independent-режиме Word или при
     * separateDocuments — по одному на участника.
     */
    offers: IPreparedDocument[];
    invoices: IPreparedDocument[];
    /** Что не сошлось при слиянии наборов (сроки, скидки). */
    warnings: string[];
    mode: DocumentVariantsMode;
}

interface RenderedOffers {
    core: OfferWordCoreGenerateResult;
    offers: IPreparedDocument[];
}

/**
 * Сборка КП и счетов v2 — несколько участников (вариантов комплекта).
 *
 * Отдельный сервис, а не ветка в DocumentBuildService: заказчик просил
 * старый путь генерации не трогать. Core-сервисы (рендер DOCX, счета, PDF)
 * переиспользуются как есть — они печатают одного участника, а кого именно
 * и сколько раз, решается здесь.
 */
@Injectable()
export class OfferWordMultiBuildService {
    private readonly logger = new Logger(OfferWordMultiBuildService.name);

    constructor(
        private readonly offerWordCoreGenerate: OfferWordCoreGenerateService,
        private readonly invoiceGenerateService: InvoiceWordCoreGenerateService,
        private readonly pdfExportService: OfferWordPdfExportService,
        private readonly pdfMergeService: PdfMergeService,
    ) {}

    /**
     * Режим — из настроек сборки:
     * single — один участник, как раньше;
     * compare — открытый вариант (остальные наборы «для сравнения» по флагу);
     * merged — один документ с объединённым наполнением и общим итогом;
     * independent — рендер на участника: PDF склеиваются в один, а при
     * separateDocuments (или Word) отдаются по документу на участника.
     * Счета — по договору: группа участников на тип договора.
     */
    async build(
        dto: OfferWordMultiGenerateDto,
    ): Promise<IOfferWordMultiBuildResult> {
        const isPdf = !dto.isWord;
        const year = dayjs().format('YYYY');
        const resolved = resolveDocumentVariants(dto);
        const warnings: string[] = [];

        const rendered = await this.renderOffers(
            dto,
            resolved,
            year,
            isPdf,
            warnings,
        );

        let invoices: IPreparedDocument[] = [];
        try {
            if (
                dto.invoice.needGeneralInvoice ||
                dto.invoice.needManyInvoices
            ) {
                invoices = await this.buildInvoicesByContract(
                    dto,
                    resolved,
                    year,
                    isPdf,
                    warnings,
                );
            }
        } catch (error) {
            // счёт — дополнение к КП: без него КП всё равно отдаём
            this.logger.error(
                `${dto.domain}: счета не собрались — ${(error as Error)?.message}`,
            );
        }

        if (warnings.length) {
            this.logger.warn(`${dto.domain}: ${warnings.join('; ')}`);
        }

        return {
            template: rendered.core.template,
            renderData: rendered.core.renderData,
            offer: rendered.offers[0],
            offers: rendered.offers,
            invoices,
            warnings,
            mode: resolved.mode,
        };
    }

    private async renderOffers(
        dto: OfferWordMultiGenerateDto,
        resolved: ResolvedDocumentVariants,
        year: string,
        isPdf: boolean,
        warnings: string[],
    ): Promise<RenderedOffers> {
        switch (resolved.mode) {
            case 'merged': {
                const merged = mergeDocumentVariants(resolved.variants);
                warnings.push(...merged.warnings);
                return this.renderSingleOffer(
                    withVariant(dto, merged.variant),
                    year,
                    isPdf,
                );
            }
            case 'independent':
                return this.renderIndependentOffers(dto, resolved, year, isPdf);
            case 'compare':
                return this.renderSingleOffer(
                    withVariant(
                        dto,
                        withComparisonSets(
                            resolved.variants,
                            resolved.showAlternatives,
                        ),
                    ),
                    year,
                    isPdf,
                );
            default:
                return this.renderSingleOffer(
                    withVariant(dto, resolved.variants[0]),
                    year,
                    isPdf,
                );
        }
    }

    private async renderSingleOffer(
        offerDto: OfferWordByTemplateGenerateDto,
        year: string,
        isPdf: boolean,
    ): Promise<RenderedOffers> {
        const core = await this.renderOffer(offerDto);
        return {
            core,
            offers: [
                await this.buildOfferDocument(offerDto, core, year, isPdf),
            ],
        };
    }

    private renderOffer(
        dto: OfferWordByTemplateGenerateDto,
    ): Promise<OfferWordCoreGenerateResult> {
        return this.offerWordCoreGenerate.execute(dto, {
            publishDocxLink: true,
        });
    }

    /**
     * «На каждый набор своя страница»: рендер по участнику. PDF склеиваются
     * в один документ, если не просили отдельные документы; Word всегда по
     * одному файлу на участника — docx надёжно не сливаются.
     */
    private async renderIndependentOffers(
        dto: OfferWordMultiGenerateDto,
        resolved: ResolvedDocumentVariants,
        year: string,
        isPdf: boolean,
    ): Promise<RenderedOffers> {
        const documents: IPreparedDocument[] = [];
        let firstCore: OfferWordCoreGenerateResult | null = null;

        for (const variant of resolved.variants) {
            const variantDto = withVariant(dto, variant);
            const core = await this.renderOffer(variantDto);
            firstCore ??= core;
            documents.push(
                await this.buildOfferDocument(variantDto, core, year, isPdf),
            );
        }
        if (!firstCore) {
            throw new Error('renderIndependentOffers: нет участников');
        }

        const allPdf =
            isPdf && documents.every(item => /\.pdf$/i.test(item.absolutePath));
        if (resolved.separateDocuments || !allPdf || documents.length < 2) {
            return { core: firstCore, offers: documents };
        }

        try {
            const merged = await this.pdfMergeService.merge({
                pdfAbsolutePaths: documents.map(item => item.absolutePath),
                domain: dto.domain,
                userId: dto.userId,
                year,
            });
            return {
                core: firstCore,
                offers: [
                    {
                        link: merged.link,
                        name: getOfferDocumentProductName(
                            withVariant(dto, resolved.variants[0]),
                        ),
                        type: 'offer',
                        absolutePath: merged.absolutePath,
                    },
                ],
            };
        } catch (error) {
            // не склеилось — отдаём по одному, документы не теряем
            this.logger.warn(
                'PDF merge failed, returning separate documents',
                (error as Error)?.message,
            );
            return { core: firstCore, offers: documents };
        }
    }

    /** Счёт на договор: участники группируются по типу договора. */
    private async buildInvoicesByContract(
        dto: OfferWordMultiGenerateDto,
        resolved: ResolvedDocumentVariants,
        year: string,
        isPdf: boolean,
        warnings: string[],
    ): Promise<IPreparedDocument[]> {
        if (resolved.mode === 'single' || resolved.mode === 'compare') {
            // счёт выставляется на то, что выбрано, — на открытый вариант
            return this.buildInvoiceDocuments(
                withVariant(dto, resolved.variants[0]),
                year,
                isPdf,
            );
        }

        const invoices: IPreparedDocument[] = [];
        for (const group of groupVariantsByContractType(resolved.variants)) {
            const merged = mergeDocumentVariants(group);
            warnings.push(...merged.warnings);
            invoices.push(
                ...(await this.buildInvoiceDocuments(
                    withVariant(dto, merged.variant),
                    year,
                    isPdf,
                )),
            );
        }
        return invoices;
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
        const results: IPreparedDocument[] = [];
        let isAlternative = false;
        let invoiceCount = 0;

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
                name: getInvoiceDocumentProductName(
                    dto,
                    isAlternative,
                    invoiceCount,
                ),
                type: 'invoice',
                absolutePath,
            });

            isAlternative = true;
            invoiceCount++;
        }

        return results;
    }
}
