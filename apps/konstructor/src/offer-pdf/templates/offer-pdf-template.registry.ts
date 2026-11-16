import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { paletteInfo } from './kit/theme/offer-pdf-palette';
import { classicTemplate } from './classic/classic.template';
import { prismTemplate } from './prism/prism.template';
import { facetTemplate } from './facet/facet.template';
import { lavenderTemplate } from './lavender/lavender.template';
import { pearlTemplate } from './pearl/pearl.template';
import { haloTemplate } from './halo/halo.template';
import { silkTemplate } from './silk/silk.template';
import { moderneTemplate } from './moderne/moderne.template';
import { iskraTemplate } from './iskra/iskra.template';
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
    facetTemplate,
    lavenderTemplate,
    pearlTemplate,
    haloTemplate,
    silkTemplate,
    moderneTemplate,
    iskraTemplate,
];

export const findOfferPdfTemplate = (
    code: OfferPdfTemplateCode,
): OfferPdfTemplate | undefined =>
    OFFER_PDF_TEMPLATES.find(template => template.code === code);

export const listOfferPdfTemplates = (): OfferPdfTemplateInfo[] =>
    OFFER_PDF_TEMPLATES.map(
        ({
            code,
            name,
            description,
            hasCover,
            hasPromo,
            lockedSettings,
            palettes,
        }) => ({
            code,
            name,
            description,
            hasCover,
            hasPromo,
            lockedSettings: lockedSettings ?? {},
            palettes: (palettes ?? []).map(paletteInfo),
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
