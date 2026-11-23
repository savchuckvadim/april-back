import type { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';

/**
 * Название варианта комплекта для титульника и первого листа; null — документ
 * печатается без него (вариант не задан или название пустое).
 */
export const variantTitleOf = (
    model: Pick<OfferPdfDocumentModel, 'variantTitle'>,
): string | null => model.variantTitle?.trim() || null;
