import type { IInvoiceSingleItemRenderData } from '@app/konstructor/offer-word/services/render-data-services/invoice-render-data.service';
import type {
    InvoicePdfModel,
    InvoicePdfSigner,
} from '../../invoice/model/invoice-pdf.model';
import { INVOICE_PDF_DEFAULT_STYLE_CODE } from '../../invoice/style/invoice-pdf-style.registry';
import { createOfferRenderDataFixture } from './offer-pdf-model.fixture';

/**
 * Данные одного счёта как их отдаёт `splitInvoiceRenderData` — без БД: реквизиты,
 * получатель, строки и итоги берутся из образца КП, поверх них номер, дата и
 * срок оплаты. Налога нет (как у поставщика без НДС): строка налога пустая.
 */
export const createInvoiceDataFixture = (
    overrides: Partial<IInvoiceSingleItemRenderData> = {},
): IInvoiceSingleItemRenderData => {
    const offer = createOfferRenderDataFixture();
    return {
        MyCompanyName: offer.MyCompanyName,
        MyCompanyFullName: offer.MyCompanyFullName,
        MyCompanyINN: offer.MyCompanyINN,
        MyCompanyKPP: offer.MyCompanyKPP,
        MyCompanyAddress: offer.MyCompanyAddress,
        MyCompanyPrimaryAddress: offer.MyCompanyPrimaryAddress,
        MyCompanyPhone: offer.MyCompanyPhone,
        MyCompanyEmail: offer.MyCompanyEmail,
        MyCompanyBank: offer.MyCompanyBank,
        MyCompanyBankAddress: offer.MyCompanyBankAddress,
        MyCompanyBik: offer.MyCompanyBik,
        MyCompanyRs: offer.MyCompanyRs,
        MyCompanyKs: offer.MyCompanyKs,
        MyCompanyOgrn: offer.MyCompanyOgrn,
        MyCompanyInvoiceRq: offer.MyCompanyInvoiceRq,
        RecipientName: offer.RecipientName,
        RecipientPosition: offer.RecipientPosition,
        RecipientNameCase: offer.RecipientNameCase,
        RecipientPositionCase: offer.RecipientPositionCase,
        RecipientCompanyName: offer.RecipientCompanyName,
        RecipientInn: offer.RecipientInn,
        RecipientInvoiceRq: offer.RecipientInvoiceRq,
        ProductRows: offer.ProductRows,
        TotalRow: (offer.TotalRow ?? []).map(total => ({
            ...total,
            TaxSum: '',
            TaxSumString: '',
            TotalTaxInvoiceInfo: 'Без налога (НДС)',
        })),
        InvoiceNumber: '15',
        InvoiceDate: '27 ноября 2026 г.',
        InvoicePaymentDate: '5 декабря 2026 г.',
        ...overrides,
    };
};

/** Подписант образца: организация с руководителем и главным бухгалтером. */
export const INVOICE_SIGNER_FIXTURE: InvoicePdfSigner = {
    position: 'Генеральный директор ООО «Гарант-Сервис Воронеж»',
    director: 'Кузнецов А. В.',
    accountant: 'Петрова М. И.',
};

export const createInvoicePdfModelFixture = (
    overrides: Partial<InvoicePdfModel> = {},
): InvoicePdfModel => ({
    styleCode: INVOICE_PDF_DEFAULT_STYLE_CODE,
    data: createInvoiceDataFixture(),
    signer: INVOICE_SIGNER_FIXTURE,
    images: {},
    ...overrides,
});
