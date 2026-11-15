import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';

export interface OfferManager {
    position: string;
    name: string;
    email: string | null;
    phone: string | null;
}

/** Менеджер для подвала и титульника; null — настройка выключена или имени нет */
export const managerOf = (
    model: OfferPdfDocumentModel,
): OfferManager | null => {
    const { data, settings } = model;
    const name = data.ManagerName?.trim() ?? '';
    if (!settings.withManager || name.length === 0) return null;
    return {
        position: data.ManagerPosition?.trim() || 'Ваш персональный менеджер',
        name,
        email: data.ManagerEmail?.trim() || null,
        phone: data.ManagerPhone?.trim() || null,
    };
};
