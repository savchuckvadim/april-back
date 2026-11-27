import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { estimateLetterHeight } from '../letter/letter-fit.util';
import { variantTitleOf } from '../lib/variant-title.util';
import { estimatePriceBlockHeight } from '../price/price-fit.util';
import { SMALL_TABLE_ROWS } from '../price/price.layout';
import { A4, type OfferPdfTheme } from '../theme/offer-pdf-theme';
import { estimateVariantBannerHeight } from './variant-banner.util';

/** Доля листа, которую разрешаем занять письму с ценами: запас на шапку и подвал стиля */
const SHEET_SHARE = 0.9;

/**
 * Доля вместимости листа, начиная с которой таблица цен считается большой и
 * открывает новый лист (priceStartsOwnSheet). Оценка высоты завышена на
 * 20–30 % (замер 19.11.2026: три строки с подписью поставки занимают на листе
 * 230–240 пунктов, по оценке 275–310). 0,4 вместимости — это 234–246 пунктов
 * оценки, около 190–200 пунктов в натуре: ниже этой планки таблица в четыре
 * строки с короткими названиями без подписи поставки продолжает лист после
 * наполнения, выше — уходит на новый целиком. Строки с подписью поставки
 * (обычный вид КП) дают на 4 строки 52–57 % вместимости, на 5 строк — 59–64 %,
 * на 14 строк — больше целого листа.
 */
const PRICE_OWN_SHEET_SHARE = 0.4;

/** Сколько содержимого помещается на одном листе темы */
export const sheetCapacity = (theme: OfferPdfTheme): number =>
    (A4.height - theme.page.paddingTop - theme.page.paddingBottom) *
    SHEET_SHARE;

/** Есть ли подпись под заголовком «Стоимость» */
const hasPriceCaption = ({ data }: OfferPdfDocumentModel): boolean =>
    Boolean(data.GeneralProductByContractName || data.GeneralProductName);

/** Высота раздела «Стоимость» этого КП по оценке до раскладки */
const estimatePrice = (
    model: OfferPdfDocumentModel,
    theme: OfferPdfTheme,
): number => {
    const { data, settings } = model;
    return estimatePriceBlockHeight(theme, {
        rows: data.ProductRows ?? [],
        withCaption: hasPriceCaption(model),
        withTotals: Boolean(data.TotalRow?.[0]),
        salePhrase: settings.salePhrase,
    });
};

/**
 * Заголовок «Стоимость», подпись и короткая таблица (до SMALL_TABLE_ROWS
 * строк) — один неделимый блок. Не помещаются внизу листа — уходят на
 * следующий вместе, заголовок не остаётся над пустым местом (КП 27.11.2026:
 * заголовок с подписью остались внизу листа, таблица из трёх строк ушла на
 * следующий). Помещается ли блок, react-pdf решает по настоящей высоте.
 * Оценка здесь только предохранитель: неделимый блок выше листа react-pdf
 * кладёт под подвал, поэтому раздел, который по оценке (с запасом) выше
 * вместимости листа, общей обёртки не получает.
 */
export const priceKeepsHeadingWithTable = (
    model: OfferPdfDocumentModel,
    theme: OfferPdfTheme,
): boolean =>
    (model.data.ProductRows ?? []).length <= SMALL_TABLE_ROWS &&
    estimatePrice(model, theme) <= sheetCapacity(theme);

/**
 * Сколько места держать перед разделом «Стоимость», когда таблица длинная и
 * рвётся по строкам: заголовок, подпись, шапка таблицы и первая строка (с
 * заголовком её набора) встают на один лист. Не помещаются внизу листа —
 * раздел начинается со следующего. Оценка с запасом, не больше вместимости
 * листа.
 */
export const priceStartPresence = (
    model: OfferPdfDocumentModel,
    theme: OfferPdfTheme,
): number => {
    const [first] = model.data.ProductRows ?? [];
    return Math.min(
        estimatePriceBlockHeight(theme, {
            rows: first ? [first] : [],
            withCaption: hasPriceCaption(model),
            withTotals: false,
            salePhrase: null,
        }),
        sheetCapacity(theme),
    );
};

/**
 * Встанет ли раздел «Стоимость» на лист письма целиком. Письмо и цены бывают
 * разной высоты, поэтому считаем обе заранее и с запасом. Раскладке остаётся
 * простое решение: продолжить на том же листе или начать новый — неделимых
 * блоков и запретов разрыва здесь нет, на них разбивка по листам зацикливается.
 */
export const priceFitsLetterSheet = (
    model: OfferPdfDocumentModel,
    theme: OfferPdfTheme,
): boolean =>
    estimateLetterHeight(theme, model) +
        // название варианта открывает лист письма и занимает его высоту
        estimateVariantBannerHeight(theme, variantTitleOf(model)) +
        estimatePrice(model, theme) <=
    sheetCapacity(theme);

/**
 * Большая ли таблица цен. Цен бывает очень много: большая таблица открывает
 * новый лист после наполнения и идёт целиком (решение владельца 19.11.2026).
 * Короткая продолжает лист наполнения. Таблицу до SMALL_TABLE_ROWS строк
 * react-pdf не рвёт и сам переносит целиком, когда внизу листа нет места:
 * она остаётся при наполнении, как бы высоко её ни оценили. Дальше решает
 * оценка высоты против доли листа PRICE_OWN_SHEET_SHARE.
 */
export const priceStartsOwnSheet = (
    model: OfferPdfDocumentModel,
    theme: OfferPdfTheme,
): boolean =>
    (model.data.ProductRows ?? []).length > SMALL_TABLE_ROWS &&
    estimatePrice(model, theme) > sheetCapacity(theme) * PRICE_OWN_SHEET_SHARE;
