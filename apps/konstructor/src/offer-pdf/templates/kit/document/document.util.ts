import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { OfferPdfSettings } from '../../../model/offer-pdf-settings';
import type { OfferPdfChrome } from './offer-pdf-chrome';

/** Заголовок PDF в свойствах файла */
export const offerDocumentTitle = (data: IOfferWordRenderData): string =>
    data.GeneralProductName
        ? `Коммерческое предложение — ${data.GeneralProductName}`
        : 'Коммерческое предложение';

/** Какие листы печатаются перед разделами и где стоит письмо */
export interface OfferDocumentPages {
    /** Титульник: есть у стиля и включён настройкой */
    withCover: boolean;
    /** Промо-страница: есть у стиля и включена настройкой */
    withPromo: boolean;
    /** Письмо и подпись стоят на промо-странице — в начале документа их нет */
    letterInPromo: boolean;
    /** Письмо печатается среди листов с разделами (не на промо-странице и не выключено) */
    letterOnSheets: boolean;
}

/**
 * Письмо выключено (withLetter): его нет нигде, подпись и печать под ним тоже.
 * Промо-страница, что целиком состоит из письма (promoReplacesLetter), без
 * письма пуста и не печатается.
 */
export const offerDocumentPages = (
    settings: OfferPdfSettings,
    chrome: Pick<OfferPdfChrome, 'Cover' | 'Promo' | 'promoReplacesLetter'>,
): OfferDocumentPages => {
    const promoIsLetter = Boolean(chrome.promoReplacesLetter);
    const withPromo =
        Boolean(chrome.Promo) &&
        settings.withPromo &&
        (settings.withLetter || !promoIsLetter);
    const letterInPromo = withPromo && promoIsLetter;
    return {
        withCover: Boolean(chrome.Cover) && settings.withCover,
        withPromo,
        letterInPromo,
        letterOnSheets: settings.withLetter && !letterInPromo,
    };
};

export type OfferSectionKey = 'price' | 'stamps' | 'infoblocks';

/**
 * Порядок разделов. Подпись руководителя — под письмом, как в старой
 * версии; при «сначала цена» — сразу после цены. В конце документа она
 * оставалась одна на пустой странице. Подписи среди разделов нет, если она
 * выключена, письма нет (withLetter) или она уже стоит под письмом на
 * промо-странице (withoutStamps).
 */
export const offerSectionOrder = (
    settings: OfferPdfSettings,
    withoutStamps = false,
): OfferSectionKey[] => {
    const stamps: OfferSectionKey[] =
        settings.withStamps && settings.withLetter && !withoutStamps
            ? ['stamps']
            : [];
    return settings.isPriceFirst
        ? ['price', ...stamps, 'infoblocks']
        : [...stamps, 'infoblocks', 'price'];
};

/** Поток листов: свой <Page>, со своим началом на новом листе */
export interface OfferSheetFlow {
    /** Поток открывается письмом */
    withLetter: boolean;
    /** Разделы потока в порядке печати */
    keys: OfferSectionKey[];
}

export interface OfferSheetFlowsInput {
    /**
     * Письмо печатается среди листов с разделами: оно включено (withLetter) и
     * стоит не на промо-странице. Иначе поток письма не открывается.
     */
    letterOnSheets: boolean;
    /** Таблица цен помещается на лист письма целиком (расчёт до раскладки) */
    priceFitsLetter: boolean;
    /** Таблица цен большая: после наполнения открывает новый лист (расчёт до раскладки) */
    priceStartsSheet: boolean;
}

/**
 * Потоки листов с разделами (решение владельца 16.11.2026):
 * - письмо с подписью занимает свои листы, наполнение всегда открывает новый;
 * - при «сначала цена» таблица цен встаёт на лист письма, только если
 *   помещается там целиком; иначе письмо остаётся одно, цена с подписью
 *   открывают следующий лист;
 * - при обычном порядке большая таблица цен (priceStartsSheet) открывает после
 *   наполнения новый лист и идёт целиком (19.11.2026); короткая продолжает
 *   лист наполнения;
 * - письма на листах нет (выключено или стоит на промо-странице): потока
 *   письма и подписи нет, цена «сначала» идёт своим потоком, наполнение
 *   открывает следующий.
 *
 * Каждый поток — отдельный <Page>, как титульник и промо-страница.
 * Принудительный разрыв внутри одного потока (свойство `break`) не годится:
 * в ряде раскладок (длинное письмо, цена и подпись перед разрывом) разбивка
 * react-pdf на нём зацикливается, рендер висит.
 */
export const offerSheetFlows = (
    settings: OfferPdfSettings,
    { letterOnSheets, priceFitsLetter, priceStartsSheet }: OfferSheetFlowsInput,
): OfferSheetFlow[] => {
    const order = offerSectionOrder(settings, !letterOnSheets);
    const index = order.indexOf('infoblocks');
    const before = order.slice(0, index);
    const flows: OfferSheetFlow[] = [];
    if (letterOnSheets) {
        const priceApart = before[0] === 'price' && !priceFitsLetter;
        flows.push({ withLetter: true, keys: priceApart ? [] : before });
        if (priceApart) flows.push({ withLetter: false, keys: before });
    } else if (before.length > 0) {
        flows.push({ withLetter: false, keys: before });
    }
    const rest = order.slice(index);
    // цена после наполнения: большая таблица открывает свой поток-лист
    const priceAt = rest.indexOf('price');
    if (priceStartsSheet && priceAt > 0) {
        flows.push({ withLetter: false, keys: rest.slice(0, priceAt) });
        flows.push({ withLetter: false, keys: rest.slice(priceAt) });
    } else {
        flows.push({ withLetter: false, keys: rest });
    }
    return flows;
};
