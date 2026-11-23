import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { mergeDocumentVariants } from '@app/konstructor/offer-word/multi/lib/variants/merge-document-variants';
import {
    DocumentVariantsMode,
    resolveDocumentVariants,
} from '@app/konstructor/offer-word/multi/lib/variants/resolve-document-variants';
import { withComparisonSets } from '@app/konstructor/offer-word/multi/lib/variants/with-comparison-sets';
import { withVariant } from '@app/konstructor/offer-word/multi/lib/variants/with-variant';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OfferPdfPrintInput } from '../model/offer-pdf-print-input';

/** Один печатаемый PDF-документ: запрос одного участника и его название. */
export interface OfferPdfPrintUnit {
    /** Запрос одиночного документа: участник уже подставлен, `variants` нет */
    input: OfferPdfPrintInput;
    /**
     * Название варианта для титульника и первого листа. Задаётся, когда
     * каждый вариант печатается своим документом (`independent`); иначе null.
     */
    variantTitle: string | null;
}

export interface OfferPdfPrintPlan {
    mode: DocumentVariantsMode;
    /** Документы в порядке печати: по числу рендеров */
    units: OfferPdfPrintUnit[];
    /** independent: отдельный файл на вариант, PDF не склеиваются */
    separateDocuments: boolean;
    /** Что не сошлось при слиянии вариантов (сроки, скидки) */
    warnings: string[];
}

const unitOf = (
    dto: OfferPdfGenerateDto,
    variant: DocumentVariantDto,
    variantTitle: string | null = null,
): OfferPdfPrintUnit => ({ input: withVariant(dto, variant), variantTitle });

/**
 * Что и сколько раз печатать. Режим определяет та же функция, что у Word-КП:
 * single — один документ из полей запроса (вариант один — из него);
 * compare — открытый вариант, остальные наборами «для сравнения» по флагу;
 * merged — один документ из слитого варианта;
 * independent — по документу на вариант, дальше они склеиваются в один PDF
 * или отдаются отдельными файлами.
 * Настройки PDF (settings, letter, documentNumber, стиль, гамма) общие: они
 * остаются в запросе каждого документа.
 */
export const planOfferPdfPrint = (
    dto: OfferPdfGenerateDto,
): OfferPdfPrintPlan => {
    const resolved = resolveDocumentVariants(dto);
    const warnings: string[] = [];
    let units: OfferPdfPrintUnit[];

    switch (resolved.mode) {
        case 'merged': {
            const merged = mergeDocumentVariants(resolved.variants);
            warnings.push(...merged.warnings);
            units = [unitOf(dto, merged.variant)];
            break;
        }
        case 'independent':
            units = resolved.variants.map(variant =>
                unitOf(dto, variant, variant.title),
            );
            break;
        case 'compare':
            units = [
                unitOf(
                    dto,
                    withComparisonSets(
                        resolved.variants,
                        resolved.showAlternatives,
                    ),
                ),
            ];
            break;
        default:
            // без вариантов первый участник — сами поля запроса
            units = [unitOf(dto, resolved.variants[0])];
    }

    return {
        mode: resolved.mode,
        units,
        separateDocuments: resolved.separateDocuments,
        warnings,
    };
};
