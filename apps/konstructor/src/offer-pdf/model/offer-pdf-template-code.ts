/**
 * Коды встроенных PDF-шаблонов КП. Шаблоны живут в коде (templates/*);
 * шаблон из БД (offer-template со страницами и блоками) подключится сюда же
 * отдельным кодом через тот же интерфейс OfferPdfTemplate.
 */
export enum OfferPdfTemplateCode {
    CLASSIC = 'classic',
}

export const OFFER_PDF_DEFAULT_TEMPLATE_CODE = OfferPdfTemplateCode.CLASSIC;
