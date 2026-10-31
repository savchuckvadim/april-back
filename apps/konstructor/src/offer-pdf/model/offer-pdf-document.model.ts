import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { OfferPdfSettings } from './offer-pdf-settings';
import { OfferPdfTemplateCode } from './offer-pdf-template-code';

/** Сопроводительное письмо: null — шаблон подставит свой текст по умолчанию. */
export interface OfferPdfLetter {
    appeal: string | null;
    text: string | null;
}

/** Подписант блока «печать и подпись» — руководитель из реквизитов поставщика. */
export interface OfferPdfSigner {
    position: string;
    name: string;
}

/** Картинка для react-pdf: сырые байты + формат, без путей и URL. */
export interface OfferPdfImage {
    data: Buffer;
    format: 'png' | 'jpg';
}

/**
 * Логотип, печать, подпись. Сейчас всегда пусто: новая модель реквизитов
 * (RqEntity) изображения не хранит — см. постановку, этап 2.
 */
export interface OfferPdfImages {
    logo?: OfferPdfImage;
    stamp?: OfferPdfImage;
    signature?: OfferPdfImage;
}

export interface OfferPdfDocumentMeta {
    /** Дата документа по-русски: «31 октября 2026 г.» */
    date: string;
    documentNumber: string | null;
}

/**
 * Всё, что нужно шаблону, чтобы нарисовать КП. Данные документа (цены,
 * наполнение, реквизиты) — те же, что идут в Word-шаблон, поверх них —
 * настройки, письмо и метаданные.
 */
export interface OfferPdfDocumentModel {
    templateCode: OfferPdfTemplateCode;
    settings: OfferPdfSettings;
    data: IOfferWordRenderData;
    letter: OfferPdfLetter;
    signer: OfferPdfSigner | null;
    images: OfferPdfImages;
    meta: OfferPdfDocumentMeta;
}
