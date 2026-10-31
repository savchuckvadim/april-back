import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../../offer/type/offer-settings.type';
import {
    OFFER_PDF_DEFAULT_SETTINGS,
    resolveOfferPdfSettings,
} from '../model/offer-pdf-settings';

describe('настройки PDF-КП', () => {
    it('без входа — умолчания', () => {
        expect(resolveOfferPdfSettings()).toEqual(OFFER_PDF_DEFAULT_SETTINGS);
        expect(resolveOfferPdfSettings(null)).toEqual(
            OFFER_PDF_DEFAULT_SETTINGS,
        );
    });

    it('null в поле — умолчание, явное значение — как передано', () => {
        const settings = resolveOfferPdfSettings({
            descriptionMode: DocumentFieldDescriptionMode.BIG,
            viewMode: null,
            withStamps: false,
            isPriceFirst: null,
        });
        expect(settings.descriptionMode).toBe(DocumentFieldDescriptionMode.BIG);
        expect(settings.viewMode).toBe(DocumentFieldViewMode.LIST);
        expect(settings.withStamps).toBe(false);
        expect(settings.withManager).toBe(true);
        expect(settings.isPriceFirst).toBe(false);
    });

    it('фраза об акции обрезается, пустая → null', () => {
        expect(
            resolveOfferPdfSettings({ salePhrase: '  акция  ' }).salePhrase,
        ).toBe('акция');
        expect(
            resolveOfferPdfSettings({ salePhrase: '   ' }).salePhrase,
        ).toBeNull();
    });
});
