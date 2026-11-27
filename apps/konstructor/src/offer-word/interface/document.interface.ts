/** Что кладём на Диск Битрикса: КП и счёт — по умолчанию, договор — отдельно. */
export type DocumentLinkType = 'offer' | 'invoice' | 'contract';
type OfferDocumentType = 'offer' | 'invoice';

export interface IResultDocumentLink<
    T extends DocumentLinkType = OfferDocumentType,
> {
    link: string;
    name: string;
    type: T;
    /**
     * Имя на Диске Битрикса без расширения и без пробелов, например
     * «КП_Гарант-Юрист_Интернет_1_ОД». Из него же таймлайн собирает читаемый
     * текст ссылки. Нет поля — имя файла остаётся прежним, а текстом ссылки
     * служит `name`.
     */
    diskName?: string;
}

export interface IPreparedDocument<
    T extends DocumentLinkType = OfferDocumentType,
> extends IResultDocumentLink<T> {
    absolutePath: string;
}
