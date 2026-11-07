/** Что кладём на Диск Битрикса: КП и счёт — по умолчанию, договор — отдельно. */
export type DocumentLinkType = 'offer' | 'invoice' | 'contract';
type OfferDocumentType = 'offer' | 'invoice';

export interface IResultDocumentLink<
    T extends DocumentLinkType = OfferDocumentType,
> {
    link: string;
    name: string;
    type: T;
}

export interface IPreparedDocument<
    T extends DocumentLinkType = OfferDocumentType,
> extends IResultDocumentLink<T> {
    absolutePath: string;
}
