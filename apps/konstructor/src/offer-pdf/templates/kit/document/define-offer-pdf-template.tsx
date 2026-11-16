import type { OfferPdfBrand } from '../../../model/offer-pdf-document.model';
import type { OfferPdfSettings } from '../../../model/offer-pdf-settings';
import type { OfferPdfTemplateCode } from '../../../model/offer-pdf-template-code';
import type { OfferPdfTemplate } from '../../offer-pdf-template.interface';
import {
    paletteTheme,
    type OfferPdfPalettes,
} from '../theme/offer-pdf-palette';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import type { OfferPdfChrome } from './offer-pdf-chrome';
import { OfferPdfDocument } from './OfferPdfDocument';

interface OfferPdfTemplateBase {
    code: OfferPdfTemplateCode;
    name: string;
    description: string;
    /** Оформление листа: по титульнику и промо в нём выводятся hasCover и hasPromo */
    chrome: OfferPdfChrome;
    /** Картинки стиля — объект X_ASSETS целиком: в список попадают все */
    assets?: Readonly<Record<string, string>>;
    logos?: readonly OfferPdfBrand[];
    lockedSettings?: Partial<OfferPdfSettings>;
}

/** Описание стиля: одна тема либо гаммы (первая — по умолчанию) */
export type OfferPdfTemplateDefinition = OfferPdfTemplateBase &
    (
        | { theme: OfferPdfTheme; palettes?: undefined }
        | { palettes: OfferPdfPalettes; theme?: undefined }
    );

/**
 * Стиль КП из описания. Что можно включить настройками (титульник, промо)
 * и какие картинки грузить, выводится из самого описания: набранные руками
 * флаги и списки расходились с оформлением молча.
 */
export const defineOfferPdfTemplate = (
    definition: OfferPdfTemplateDefinition,
): OfferPdfTemplate => {
    const { code, name, description, chrome, assets, logos, lockedSettings } =
        definition;
    return {
        code,
        name,
        description,
        hasCover: Boolean(chrome.Cover),
        hasPromo: Boolean(chrome.Promo),
        lockedSettings,
        palettes: definition.palettes,
        assets: assets && Object.values(assets),
        logos,
        render: (model, frame) => (
            <OfferPdfDocument
                model={model}
                theme={
                    definition.palettes
                        ? paletteTheme(definition.palettes, model.palette)
                        : definition.theme
                }
                chrome={chrome}
                frame={frame}
            />
        ),
    };
};
