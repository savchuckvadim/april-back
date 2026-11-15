import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { OfferPdfDocumentMeta } from '../../../model/offer-pdf-document.model';

/** «Исх. № 12 от 31 октября 2026 г.» или просто дата */
export const letterDateLine = (meta: OfferPdfDocumentMeta): string =>
    meta.documentNumber
        ? `Исх. № ${meta.documentNumber} от ${meta.date}`
        : meta.date;

/** Адресат справа: должность, компания, ИНН, ФИО — только заполненное */
export const recipientLines = (data: IOfferWordRenderData): string[] =>
    [
        data.RecipientPositionCase,
        data.RecipientCompanyName,
        data.RecipientInn ? `ИНН ${data.RecipientInn}` : '',
        data.RecipientNameCase,
    ]
        .map(line => line?.trim() ?? '')
        .filter(line => line.length > 0);
