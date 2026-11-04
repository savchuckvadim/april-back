import type { ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import type { OfferPdfPageFrame } from '../lib/pdf-layout';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';

/**
 * PDF-шаблон КП. Единственная обязанность — из модели документа собрать
 * React-дерево `<Document>` для @react-pdf/renderer. Данные шаблон не
 * считает и не ходит в БД: всё приходит в модели. Поля страницы (frame)
 * сервис рендера подбирает по измеренным шапке и подвалу; без них шаблон
 * берёт свои.
 */
export interface OfferPdfTemplate {
    readonly code: OfferPdfTemplateCode;
    /** Название для выбора в конструкторе */
    readonly name: string;
    readonly description: string;
    render(
        model: OfferPdfDocumentModel,
        frame?: OfferPdfPageFrame,
    ): ReactElement<DocumentProps>;
}

/** Описание шаблона для списка в UI (без функции рендера). */
export interface OfferPdfTemplateInfo {
    code: OfferPdfTemplateCode;
    name: string;
    description: string;
}
