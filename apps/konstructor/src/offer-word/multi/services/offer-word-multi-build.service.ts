import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ComplectModeEnum } from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { OfferWordCoreGenerateService } from '../../services/offer-word-core/offer-word-core-generate.service';
import { InvoiceWordCoreGenerateService } from '../../services/invoice-word-core/invoice-word-core-generate.service';
import { OfferWordPdfExportService } from '../../services/pdf-export/offer-word-pdf-export.service';
import { PdfMergeService } from '../../services/pdf-export/pdf-merge.service';
import { IPreparedDocument } from '../../interface/document.interface';
import { OfferWordCoreGenerateResult } from '../../types/offer-word-core-generate.types';
import { getOfferDocumentProductName } from '../../lib/get-offer-document-product-name.util';
import { getInvoiceDocumentProductName } from '../../lib/get-invoice-document-product-name';
import {
    describeInvoiceNotBuilt,
    getErrorReason,
} from '../../lib/invoice-not-built.util';
import { OfferWordMultiGenerateDto } from '../dto/offer-word-multi-generate.dto';
import {
    DocumentVariantsMode,
    resolveDocumentVariants,
    ResolvedDocumentVariants,
} from '../lib/variants/resolve-document-variants';
import { mergeDocumentVariants } from '../lib/variants/merge-document-variants';
import { mergeGeneralSets } from '../lib/variants/merge-general-sets';
import { planOfferRenders } from '../lib/variants/plan-offer-renders';
import {
    groupVariantsByContractType,
    withVariant,
} from '../lib/variants/with-variant';

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

/** Типы договора у вариантов одного договора разные: счёт делится по типам. */
const INVOICE_SPLIT_BY_CONTRACT_TYPE_WARNING =
    'Счёт разделён по типам договора: у наборов разные типы';

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
     * Счёт следует за договором: single_contract — один счёт на все
     * варианты, multi_contract — по счёту на вариант.
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
            // счёт — дополнение к КП: КП отдаём в любом случае и сообщаем
            // менеджеру причину
            const reason = getErrorReason(error);
            this.logger.error(`${dto.domain}: счета не собрались — ${reason}`);
            this.addWarning(warnings, describeInvoiceNotBuilt(reason));
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
        // режим → запросы на рендер: тот же план использует превью
        const plan = planOfferRenders(dto, resolved);
        warnings.push(...plan.warnings);

        if (plan.perVariant) {
            return this.renderIndependentOffers(
                dto,
                plan.requests,
                resolved,
                year,
                isPdf,
            );
        }
        return this.renderSingleOffer(plan.requests[0], year, isPdf);
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
        variantDtos: readonly OfferWordByTemplateGenerateDto[],
        resolved: ResolvedDocumentVariants,
        year: string,
        isPdf: boolean,
    ): Promise<RenderedOffers> {
        const documents: IPreparedDocument[] = [];
        let firstCore: OfferWordCoreGenerateResult | null = null;

        for (const variantDto of variantDtos) {
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
                        name: getOfferDocumentProductName(variantDtos[0]),
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

    /**
     * Счёт следует за договором: один договор — один счёт. Число счетов
     * задаёт режим договоров `composition.mode`:
     * single_contract — один счёт на все варианты;
     * multi_contract — по счёту на каждый вариант;
     * compare, один вариант или запрос без `composition` — счёт на открытый
     * (первый) вариант, как раньше.
     */
    private async buildInvoicesByContract(
        dto: OfferWordMultiGenerateDto,
        resolved: ResolvedDocumentVariants,
        year: string,
        isPdf: boolean,
        warnings: string[],
    ): Promise<IPreparedDocument[]> {
        const contractMode =
            resolved.variants.length > 1 ? dto.composition?.mode : undefined;

        switch (contractMode) {
            case ComplectModeEnum.SINGLE_CONTRACT:
                return this.buildSingleContractInvoices(
                    dto,
                    resolved,
                    year,
                    isPdf,
                    warnings,
                );
            case ComplectModeEnum.MULTI_CONTRACT:
                return this.buildInvoicePerVariant(
                    dto,
                    resolved,
                    year,
                    isPdf,
                    warnings,
                );
            default:
                // счёт выставляется на то, что выбрано, — на открытый вариант
                return this.buildInvoiceDocuments(
                    withVariant(dto, resolved.variants[0]),
                    year,
                    isPdf,
                    warnings,
                );
        }
    }

    /**
     * Один договор — один счёт: варианты сливаются, наборы `sets.general`
     * сводятся в один набор. Типы договора у вариантов одинаковые (экран
     * разных типов не допускает). Запасной путь для разных типов: варианты
     * группируются по типу договора, каждая группа получает один счёт,
     * менеджер видит предупреждение.
     */
    private async buildSingleContractInvoices(
        dto: OfferWordMultiGenerateDto,
        resolved: ResolvedDocumentVariants,
        year: string,
        isPdf: boolean,
        warnings: string[],
    ): Promise<IPreparedDocument[]> {
        const groups = groupVariantsByContractType(resolved.variants);
        if (groups.length > 1) {
            this.addWarning(warnings, INVOICE_SPLIT_BY_CONTRACT_TYPE_WARNING);
        }

        const invoices: IPreparedDocument[] = [];
        for (const group of groups) {
            const variant = this.mergeIntoSingleInvoiceVariant(group, warnings);
            invoices.push(
                ...(await this.buildInvoiceDocuments(
                    withVariant(dto, variant),
                    year,
                    isPdf,
                    warnings,
                )),
            );
        }
        return invoices;
    }

    /** Каждый вариант идёт своим договором — на каждый свой счёт. */
    private async buildInvoicePerVariant(
        dto: OfferWordMultiGenerateDto,
        resolved: ResolvedDocumentVariants,
        year: string,
        isPdf: boolean,
        warnings: string[],
    ): Promise<IPreparedDocument[]> {
        const invoices: IPreparedDocument[] = [];
        for (const variant of resolved.variants) {
            invoices.push(
                ...(await this.buildInvoiceDocuments(
                    withVariant(dto, variant),
                    year,
                    isPdf,
                    warnings,
                )),
            );
        }
        return invoices;
    }

    /**
     * Группа вариантов → один вариант с одним набором в `sets.general`:
     * сборка счёта печатает по файлу на каждый набор.
     */
    private mergeIntoSingleInvoiceVariant(
        group: readonly DocumentVariantDto[],
        warnings: string[],
    ): DocumentVariantDto {
        const merged = mergeDocumentVariants(group);
        const general = mergeGeneralSets(merged.variant.sets.general);
        for (const warning of [...merged.warnings, ...general.warnings]) {
            this.addWarning(warnings, warning);
        }

        return {
            ...merged.variant,
            sets: {
                ...merged.variant.sets,
                general: general.set ? [general.set] : [],
            },
        };
    }

    /** Одинаковое предупреждение от нескольких групп договоров — одной строкой. */
    private addWarning(warnings: string[], warning: string): void {
        if (!warnings.includes(warning)) {
            warnings.push(warning);
        }
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
        warnings: string[],
    ): Promise<IPreparedDocument[]> {
        const invoiceCoreResult =
            await this.invoiceGenerateService.execute(dto);
        if (invoiceCoreResult.notBuiltReason) {
            this.addWarning(
                warnings,
                describeInvoiceNotBuilt(invoiceCoreResult.notBuiltReason),
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
                absolutePath,
            });
        }

        return results;
    }
}
