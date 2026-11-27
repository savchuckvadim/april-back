import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../model/offer-document-settings.type';
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

    it('титульник по умолчанию включён, выключается явно', () => {
        expect(resolveOfferPdfSettings().withCover).toBe(true);
        expect(resolveOfferPdfSettings({ withCover: null }).withCover).toBe(
            true,
        );
        expect(resolveOfferPdfSettings({ withCover: false }).withCover).toBe(
            false,
        );
    });

    it('письмо по умолчанию включено (старые запросы без поля), выключается явно', () => {
        expect(resolveOfferPdfSettings().withLetter).toBe(true);
        expect(resolveOfferPdfSettings({}).withLetter).toBe(true);
        expect(resolveOfferPdfSettings({ withLetter: null }).withLetter).toBe(
            true,
        );
        expect(resolveOfferPdfSettings({ withLetter: false }).withLetter).toBe(
            false,
        );
    });

    it('скидка в таблице цен по умолчанию показывается (старые запросы как раньше), скрывается явно', () => {
        expect(OFFER_PDF_DEFAULT_SETTINGS.showDiscount).toBe(true);
        expect(resolveOfferPdfSettings().showDiscount).toBe(true);
        expect(resolveOfferPdfSettings({}).showDiscount).toBe(true);
        expect(
            resolveOfferPdfSettings({ showDiscount: null }).showDiscount,
        ).toBe(true);
        expect(
            resolveOfferPdfSettings({ showDiscount: false }).showDiscount,
        ).toBe(false);
        expect(
            resolveOfferPdfSettings({ showDiscount: true }).showDiscount,
        ).toBe(true);
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
