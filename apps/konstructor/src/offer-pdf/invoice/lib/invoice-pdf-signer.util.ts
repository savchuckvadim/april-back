import type { RqEntity } from '@lib/portal-lib/konstructor/provider';
import type { InvoicePdfSigner } from '../model/invoice-pdf.model';

/** Текстовые поля rqs nullable и местами хранят строку 'null'. */
const cleanRqValue = (value?: string | null): string =>
    value && value !== 'null' ? value.trim() : '';

/**
 * «Иванов Пётр Сергеевич» → «Иванов П. С.». Имя не из трёх слов остаётся
 * как есть: так делает легаси.
 */
export const shortPersonName = (fullName?: string | null): string => {
    const name = cleanRqValue(fullName);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length !== 3) return name;
    const [surname, first, patronymic] = parts;
    return `${surname} ${first[0]}. ${patronymic[0]}.`;
};

const LLC = /общество\s+с\s+ограниченной\s+ответственностью/giu;

/** «Общество с ограниченной ответственностью «Ромашка»» → «ООО «Ромашка»». */
export const shortCompanyTitle = (fullName?: string | null): string =>
    cleanRqValue(fullName).replace(LLC, 'ООО');

/**
 * Подписант счёта по реквизитам поставщика, как в легаси: у предпринимателя
 * слева его полное название, справа пусто; у остальных слева должность
 * руководителя с названием организации, справа его фамилия с инициалами.
 * Бухгалтер печатается, когда он указан в реквизитах. Нет реквизитов или
 * нечего печатать — null.
 */
export const buildInvoiceSigner = (
    rq: RqEntity | null,
): InvoicePdfSigner | null => {
    if (!rq) return null;
    const company = shortCompanyTitle(rq.fullname || rq.shortname || rq.name);
    const accountant = shortPersonName(rq.accountant);
    if (rq.type === 'ip') {
        return company ? { position: company, director: '', accountant } : null;
    }
    const position = [cleanRqValue(rq.position), company]
        .filter(Boolean)
        .join(' ');
    const director = shortPersonName(rq.director);
    return position || director ? { position, director, accountant } : null;
};
