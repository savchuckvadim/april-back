import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { estimateLetterHeight } from '../letter/letter-fit.util';
import { estimatePriceBlockHeight } from '../price/price-fit.util';
import { A4, type OfferPdfTheme } from '../theme/offer-pdf-theme';

/** Доля листа, которую разрешаем занять письму с ценами: запас на шапку и подвал стиля */
const SHEET_SHARE = 0.9;

/** Сколько содержимого помещается на одном листе темы */
export const sheetCapacity = (theme: OfferPdfTheme): number =>
    (A4.height - theme.page.paddingTop - theme.page.paddingBottom) *
    SHEET_SHARE;

/**
 * Встанет ли раздел «Стоимость» на лист письма целиком. Письмо и цены бывают
 * разной высоты, поэтому считаем обе заранее и с запасом. Раскладке остаётся
 * простое решение: продолжить на том же листе или начать новый — неделимых
 * блоков и запретов разрыва здесь нет, на них разбивка по листам зацикливается.
 */
export const priceFitsLetterSheet = (
    model: OfferPdfDocumentModel,
    theme: OfferPdfTheme,
): boolean => {
    const { data, settings } = model;
    const price = estimatePriceBlockHeight(theme, {
        rows: data.ProductRows ?? [],
        withCaption: Boolean(
            data.GeneralProductByContractName || data.GeneralProductName,
        ),
        withTotals: Boolean(data.TotalRow?.[0]),
        salePhrase: settings.salePhrase,
    });
    return estimateLetterHeight(theme, model) + price <= sheetCapacity(theme);
};
