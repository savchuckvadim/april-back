import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { classicTemplate } from './classic/classic.template';
import { prismTemplate } from './prism/prism.template';
import { monochromeTemplate } from './monochrome/monochrome.template';
import {
    OfferPdfTemplate,
    OfferPdfTemplateInfo,
} from './offer-pdf-template.interface';

/** Реестр встроенных шаблонов: новый стиль — новый элемент массива. */
export const OFFER_PDF_TEMPLATES: readonly OfferPdfTemplate[] = [
    classicTemplate,
    prismTemplate,
    monochromeTemplate,
];

export const findOfferPdfTemplate = (
    code: OfferPdfTemplateCode,
): OfferPdfTemplate | undefined =>
    OFFER_PDF_TEMPLATES.find(template => template.code === code);

export const listOfferPdfTemplates = (): OfferPdfTemplateInfo[] =>
    OFFER_PDF_TEMPLATES.map(
        ({ code, name, description, hasCover, lockedSettings }) => ({
            code,
            name,
            description,
            hasCover,
            lockedSettings: lockedSettings ?? {},
        }),
    );

/** Модель с настройками, которые стиль задаёт сам, поверх выбора менеджера */
export const withLockedSettings = (
    model: OfferPdfDocumentModel,
    template: OfferPdfTemplate,
): OfferPdfDocumentModel =>
    template.lockedSettings
        ? {
              ...model,
              settings: { ...model.settings, ...template.lockedSettings },
          }
        : model;
