import type { IInvoiceSingleItemRenderData } from '@app/konstructor/offer-word/services/render-data-services/invoice-render-data.service';
import type { OfferPdfImage } from '../../model/offer-pdf-document.model';

/**
 * Подписант блока «подписи и печать» счёта: слева должность с названием
 * поставщика, справа расшифровка. У предпринимателя (ИП) слева стоит его
 * название, справа пусто, как в легаси.
 */
export interface InvoicePdfSigner {
    /** «Генеральный директор ООО «Ромашка»»; у ИП полное название предпринимателя */
    position: string;
    /** «Иванов И. И.»; у ИП пусто */
    director: string;
    /** Главный бухгалтер: «Петрова П. П.»; пусто — строки бухгалтера нет */
    accountant: string;
}

/**
 * Картинки реквизитов поставщика (`provider_images`) для счёта. Нет картинки
 * — нет ключа, счёт рисуется без неё.
 */
export interface InvoicePdfImages {
    stamp?: OfferPdfImage;
    signatureDirector?: OfferPdfImage;
    signatureAccountant?: OfferPdfImage;
    /** QR для оплаты: печатается справа от банковской шапки */
    qr?: OfferPdfImage;
}

/**
 * Всё, что нужно шаблону, чтобы нарисовать один счёт. Данные счёта (реквизиты,
 * получатель, строки, итоги, номер) те же, что идут в Word-шаблон счёта:
 * суммы здесь не считаются.
 */
export interface InvoicePdfModel {
    /** Код стиля счёта (см. invoice-pdf-style.registry); неизвестный — стиль по умолчанию */
    styleCode: string;
    data: IInvoiceSingleItemRenderData;
    /** Блок подписей и печати; null — «с печатями и подписями» выключено или подписанта нет */
    signer: InvoicePdfSigner | null;
    images: InvoicePdfImages;
}
