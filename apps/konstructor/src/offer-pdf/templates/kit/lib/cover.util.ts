import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { managerOf, type OfferManager } from './manager.util';
import { variantTitleOf } from './variant-title.util';

/** Что можно поставить на титульник — одно на все стили */
export interface OfferCoverContent {
    /** Наша компания (поставщик) */
    company: string | null;
    /** ИНН нашей компании */
    companyInn: string | null;
    /** Комплект: «Гарант-Предприятие» */
    product: string | null;
    /** Поставка: «Интернет версия на 2 одновременных доступа» */
    supply: string | null;
    /** Название варианта комплекта; null — вариант не печатается своим документом */
    variantTitle: string | null;
    date: string;
    /** Для кого: компания получателя */
    recipient: string | null;
    /** ИНН получателя */
    recipientInn: string | null;
    /** Кто подготовил; null — менеджер выключен настройкой */
    manager: OfferManager | null;
}

const filled = (value: string | null | undefined): string | null =>
    value?.trim() || null;

export const offerCoverContent = (
    model: OfferPdfDocumentModel,
): OfferCoverContent => {
    const { data, meta } = model;
    return {
        company: filled(data.MyCompanyName) ?? filled(data.MyCompanyFullName),
        companyInn: filled(data.MyCompanyINN),
        product: filled(data.GeneralProductName),
        supply: filled(data.GeneralSupplyNameMarketing),
        variantTitle: variantTitleOf(model),
        date: meta.date,
        recipient: filled(data.RecipientCompanyName),
        recipientInn: filled(data.RecipientInn),
        manager: managerOf(model),
    };
};
