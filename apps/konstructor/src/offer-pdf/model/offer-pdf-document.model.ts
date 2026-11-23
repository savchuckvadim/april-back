import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { OfferPdfSettings } from './offer-pdf-settings';
import { OfferPdfTemplateCode } from './offer-pdf-template-code';

/** Сопроводительное письмо: null — шаблон подставит свой текст по умолчанию. */
export interface OfferPdfLetter {
    appeal: string | null;
    text: string | null;
}

/**
 * Подписант блока «печать и подпись» — руководитель из реквизитов поставщика.
 * У реквизитов без руководителя (ИП) `position` несёт название поставщика, а
 * `name` пуст: справа от печати ничего не печатается.
 */
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
 * Логотип, печать, подпись руководителя — картинки реквизитов поставщика из
 * `provider_images` (роли logo, stamp, signature_director). Логотип кладётся в
 * модель всегда, печать и подпись — когда включено «с печатями и подписями».
 * Нет картинки — нет ключа, шаблон рисует без неё.
 */
export interface OfferPdfImages {
    logo?: OfferPdfImage;
    stamp?: OfferPdfImage;
    signature?: OfferPdfImage;
}

/** Логотипы бренда, которые умеет рисовать каркас */
export type OfferPdfBrand = 'garant' | 'iscra';

/** Путь одноцветного логотипа: заливку задаёт тема */
export interface OfferPdfLogoPath {
    d: string;
    transform?: string;
}

/** Векторный логотип из SVG: область рисования, transform группы, пути */
export interface OfferPdfLogo {
    width: number;
    height: number;
    /** Начало области (viewBox min-x, min-y); не задано — ноль */
    minX?: number;
    minY?: number;
    groupTransform?: string;
    paths: OfferPdfLogoPath[];
}

/**
 * Картинки и логотипы стиля из storage — подгружаются до рендера по списку,
 * который объявил шаблон. Нет файла — нет ключа, стиль рисуется без него.
 */
export interface OfferPdfAssets {
    images: Readonly<Record<string, OfferPdfImage>>;
    logos: Readonly<Partial<Record<OfferPdfBrand, OfferPdfLogo>>>;
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
    /** Гамма стиля; null или неизвестная — первая гамма стиля */
    palette: string | null;
    settings: OfferPdfSettings;
    data: IOfferWordRenderData;
    letter: OfferPdfLetter;
    signer: OfferPdfSigner | null;
    images: OfferPdfImages;
    meta: OfferPdfDocumentMeta;
    /**
     * Название варианта комплекта (`DocumentVariantDto.title`). Задаётся, когда
     * каждый вариант печатается своим документом: титульник и первый лист
     * показывают его, чтобы в склеенном PDF было видно, где какой вариант.
     * Не задано или пусто — документ печатается без названия варианта.
     */
    variantTitle?: string | null;
    /** Картинки и логотипы стиля — кладёт сервис рендера */
    assets?: OfferPdfAssets;
}
