import type { ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { InvoicePdfDocument } from './components/InvoicePdfDocument';
import type { InvoicePdfModel } from './model/invoice-pdf.model';
import { findInvoicePdfStyle } from './style/invoice-pdf-style.registry';

/**
 * Шаблон счёта: модель → React-дерево `<Document>` для @react-pdf/renderer.
 * Тема берётся по коду стиля из модели; неизвестный код даёт стиль по умолчанию.
 * Данные шаблон не считает и в БД не ходит: всё приходит в модели.
 */
export const renderInvoicePdf = (
    model: InvoicePdfModel,
): ReactElement<DocumentProps> => (
    <InvoicePdfDocument
        model={model}
        theme={findInvoicePdfStyle(model.styleCode).theme}
    />
);
