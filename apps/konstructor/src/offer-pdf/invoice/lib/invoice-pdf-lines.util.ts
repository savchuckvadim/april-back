import type {
    IInvoiceSingleItemRenderData,
    IInvoiceRenderGeneralData,
} from '@app/konstructor/offer-word/services/render-data-services/invoice-render-data.service';
import type { ITotalRowItemRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import { joinNonEmpty } from '../../templates/kit/lib/text.util';

/** «Счёт на оплату № 15 от 27 ноября 2026 г.»; без номера — «Счёт на оплату от …». */
export const invoiceTitle = (
    data: Pick<IInvoiceRenderGeneralData, 'InvoiceNumber' | 'InvoiceDate'>,
): string =>
    joinNonEmpty(
        [
            'Счёт на оплату',
            data.InvoiceNumber?.trim() ? `№ ${data.InvoiceNumber.trim()}` : '',
            data.InvoiceDate?.trim() ? `от ${data.InvoiceDate.trim()}` : '',
        ],
        ' ',
    );

/** «Срок оплаты: 5 декабря 2026 г.»; срока нет — null. */
export const paymentDueLine = (
    data: Pick<IInvoiceRenderGeneralData, 'InvoicePaymentDate'>,
): string | null => data.InvoicePaymentDate?.trim() || null;

/**
 * Поставщик одной строкой, как в легаси: название, ИНН, адрес, телефон.
 * КПП добавлен после ИНН, когда он есть у реквизитов.
 */
export const supplierLine = (
    data: Pick<
        IInvoiceSingleItemRenderData,
        | 'MyCompanyFullName'
        | 'MyCompanyName'
        | 'MyCompanyINN'
        | 'MyCompanyKPP'
        | 'MyCompanyAddress'
        | 'MyCompanyPhone'
    >,
): string =>
    joinNonEmpty([
        data.MyCompanyFullName || data.MyCompanyName,
        data.MyCompanyINN ? `ИНН: ${data.MyCompanyINN}` : '',
        data.MyCompanyKPP ? `КПП: ${data.MyCompanyKPP}` : '',
        data.MyCompanyAddress,
        data.MyCompanyPhone,
    ]);

/**
 * Покупатель: организация, а у физлица без организации его имя; затем ИНН.
 * Покупателя в запросе нет — null, строка в счёте не печатается.
 */
export const buyerLine = (
    data: Pick<
        IInvoiceSingleItemRenderData,
        'RecipientCompanyName' | 'RecipientName' | 'RecipientInn'
    >,
): string | null => {
    const name =
        data.RecipientCompanyName?.trim() || data.RecipientName?.trim();
    if (!name) return null;
    return joinNonEmpty([
        name,
        data.RecipientInn?.trim() ? `ИНН: ${data.RecipientInn.trim()}` : '',
    ]);
};

/** «(Сто рублей 00 копеек)» → «Сто рублей 00 копеек»: скобки в счёте ни к чему. */
const withoutParens = (value: string): string =>
    value.replace(/^\s*\(\s*/, '').replace(/\s*\)\s*$/, '');

export interface InvoiceTotalLines {
    /** «Итого: 145500.00 руб.» */
    total: string;
    /** «Налог (НДС 5%): 6928.57 руб.» или «Без налога (НДС)»; нечего печатать — null */
    tax: string | null;
    /** «Всего наименований 2, на сумму 145500.00 руб.» */
    count: string;
    /** Сумма прописью без скобок; нет — null */
    words: string | null;
}

/**
 * Итоги счёта по строке «Итого» набора (те же значения, что идут в Word-счёт)
 * и числу строк таблицы. Суммы не считаются: берутся готовые строки.
 */
export const invoiceTotalLines = (
    total: ITotalRowItemRenderData | undefined,
    rowCount: number,
): InvoiceTotalLines | null => {
    if (!total) return null;
    const sum = total.TotalSum?.trim() ?? '';
    const info = total.TotalTaxInvoiceInfo?.trim() ?? '';
    const taxSum = total.TaxSum?.trim() ?? '';
    const words = withoutParens(total.TotalSumString ?? '');
    const taxLine = taxSum
        ? `${info || 'В том числе налог'}: ${taxSum} руб.`
        : info;
    return {
        total: sum ? `Итого: ${sum} руб.` : 'Итого:',
        tax: taxLine || null,
        count: sum
            ? `Всего наименований ${rowCount}, на сумму ${sum} руб.`
            : `Всего наименований ${rowCount}`,
        words: words || null,
    };
};

/** Подпись под QR, как в легаси. */
export const QR_CAPTION =
    'Для оплаты через QR код откройте банковское приложение, выберите раздел «Оплата по QR коду», наведите на QR код на счёте';
