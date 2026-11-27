import type { ProviderImageRole } from '@lib/portal-lib/konstructor';
import type { RqEntity } from '@lib/portal-lib/konstructor/provider';
import type { IInvoiceSingleItemRenderData } from '@app/konstructor/offer-word/services/render-data-services/invoice-render-data.service';
import type { OfferPdfImage } from '../../model/offer-pdf-document.model';
import type {
    InvoicePdfImages,
    InvoicePdfModel,
} from '../model/invoice-pdf.model';
import { INVOICE_PDF_DEFAULT_STYLE_CODE } from '../style/invoice-pdf-style.registry';
import { buildInvoiceSigner } from './invoice-pdf-signer.util';

/**
 * Роли картинок, которые печатает счёт. QR стоит в банковской шапке и от
 * «с печатями и подписями» не зависит; печать и подписи руководителя и
 * главного бухгалтера печатаются только при включённой настройке.
 */
const INVOICE_QR_ROLES: readonly ProviderImageRole[] = ['qr'];
const INVOICE_STAMP_ROLES: readonly ProviderImageRole[] = [
    'stamp',
    'signature_director',
    'signature_accountant',
];

/** Какие картинки поставщика читать для счёта: лишние роли с диска не поднимаем. */
export const invoiceImageRoles = (
    withStamps: boolean,
): readonly ProviderImageRole[] =>
    withStamps
        ? [...INVOICE_STAMP_ROLES, ...INVOICE_QR_ROLES]
        : INVOICE_QR_ROLES;

/** Прочитанная картинка поставщика: роль, формат и байты. */
export interface InvoiceImageContent extends OfferPdfImage {
    role: ProviderImageRole;
}

/** Место картинки в `model.images` по роли; null — счёт эту роль не печатает. */
const imageSlot = (role: ProviderImageRole): keyof InvoicePdfImages | null => {
    switch (role) {
        case 'stamp':
            return 'stamp';
        case 'signature_director':
            return 'signatureDirector';
        case 'signature_accountant':
            return 'signatureAccountant';
        case 'qr':
            return 'qr';
        default:
            return null;
    }
};

/**
 * Картинки счёта из прочитанных: печать и подписи попадают в модель только
 * при включённом «с печатями и подписями», QR всегда, когда он загружен.
 */
export const invoiceImagesOf = (
    contents: readonly InvoiceImageContent[],
    withStamps: boolean,
): InvoicePdfImages => {
    const allowed = invoiceImageRoles(withStamps);
    const images: InvoicePdfImages = {};
    for (const { role, data, format } of contents) {
        const slot = imageSlot(role);
        if (slot && allowed.includes(role)) images[slot] = { data, format };
    }
    return images;
};

export interface InvoicePdfModelInput {
    /** Данные одного счёта: те же, что идут в Word-шаблон счёта */
    data: IInvoiceSingleItemRenderData;
    /** Реквизиты поставщика; нужны для подписанта */
    rq: RqEntity | null;
    contents: readonly InvoiceImageContent[];
    /** `settings.withStamps` запроса: печать, подписи и блок подписантов */
    withStamps: boolean;
    styleCode?: string | null;
}

/**
 * Модель счёта для шаблона: данные, подписант и картинки. Без «с печатями и
 * подписями» блока подписантов нет вовсе, как в легаси.
 */
export const buildInvoicePdfModel = ({
    data,
    rq,
    contents,
    withStamps,
    styleCode,
}: InvoicePdfModelInput): InvoicePdfModel => ({
    styleCode: styleCode ?? INVOICE_PDF_DEFAULT_STYLE_CODE,
    data,
    signer: withStamps ? buildInvoiceSigner(rq) : null,
    images: invoiceImagesOf(contents, withStamps),
});
