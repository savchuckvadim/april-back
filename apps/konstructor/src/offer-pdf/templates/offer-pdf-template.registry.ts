import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { classicTemplate } from './classic/classic.template';
import {
    OfferPdfTemplate,
    OfferPdfTemplateInfo,
} from './offer-pdf-template.interface';

/** Реестр встроенных шаблонов: новый стиль — новый элемент массива. */
export const OFFER_PDF_TEMPLATES: readonly OfferPdfTemplate[] = [
    classicTemplate,
];

export const findOfferPdfTemplate = (
    code: OfferPdfTemplateCode,
): OfferPdfTemplate | undefined =>
    OFFER_PDF_TEMPLATES.find(template => template.code === code);

export const listOfferPdfTemplates = (): OfferPdfTemplateInfo[] =>
    OFFER_PDF_TEMPLATES.map(({ code, name, description }) => ({
        code,
        name,
        description,
    }));
