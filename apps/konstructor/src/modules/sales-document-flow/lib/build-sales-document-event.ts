import {
    SALES_DOCUMENT_KINDS,
    SalesDocumentEventJobData,
    SalesDocumentKind,
    SalesDocumentPresentationRef,
} from '@lib/queue/constants/sales-document-event-job';
import { salesDocumentProductRows } from './sales-document-product-rows';
import { describeSalesDocument } from './sales-document-summary';
import {
    salesDocumentSum,
    SalesDocumentSource,
    toPositiveInt,
} from './sales-document-source';

/** Блок `presentation` из запроса конструктора. */
export interface SalesDocumentPresentationInput {
    readonly dealId?: number | null;
}

/** Всё, из чего собирается событие потока продаж. */
export interface SalesDocumentEventInput {
    /** Номер события: по нему воркер отсекает повтор. */
    readonly eventId: string;
    readonly domain: string;
    readonly userId: number | string | null | undefined;
    readonly companyId: number | string | null | undefined;
    readonly dealId: number | string | null | undefined;
    readonly kinds: readonly SalesDocumentKind[];
    /** Момент формирования документа. */
    readonly createdAt: Date;
    /** Блок передан (даже пустой): документ идёт «после презентации». */
    readonly presentation?: SalesDocumentPresentationInput | null;
    /** Печатаемые документы: из них считаются сумма, строки и текст. */
    readonly sources: readonly SalesDocumentSource[];
}

/** Блок презентации в событие: пустой остаётся пустым, id приводится к целому. */
const presentationRefOf = (
    presentation: SalesDocumentPresentationInput | null | undefined,
): SalesDocumentPresentationRef | undefined => {
    if (!presentation) {
        return undefined;
    }
    const dealId = toPositiveInt(presentation.dealId);
    return dealId ? { dealId } : {};
};

/** Виды без повторов в порядке контракта: КП, счёт, договор, поставка. */
const uniqueKinds = (kinds: readonly SalesDocumentKind[]): SalesDocumentKind[] =>
    SALES_DOCUMENT_KINDS.filter(kind => kinds.includes(kind));

/**
 * Событие «документ сформирован» для воркера event-sales. Чистая функция.
 *
 * Возвращает null, когда события не собрать: нет домена, пользователя,
 * компании, сделки или ни одного вида документа. Товарные строки кладутся
 * только в событие «после презентации»: воркер пишет их в сделку презентации.
 */
export const buildSalesDocumentEvent = (
    input: SalesDocumentEventInput,
): SalesDocumentEventJobData | null => {
    const userId = toPositiveInt(input.userId);
    const companyId = toPositiveInt(input.companyId);
    const dealId = toPositiveInt(input.dealId);
    const kinds = uniqueKinds(input.kinds);
    if (!input.eventId || !input.domain || !userId || !companyId || !dealId) {
        return null;
    }
    if (!kinds.length) {
        return null;
    }

    const presentation = presentationRefOf(input.presentation);
    const sum = salesDocumentSum(input.sources);
    const productRows = presentation
        ? salesDocumentProductRows(input.sources)
        : [];

    return {
        eventId: input.eventId,
        domain: input.domain,
        userId,
        companyId,
        dealId,
        kinds,
        createdAt: input.createdAt.toISOString(),
        ...(presentation ? { presentation } : {}),
        ...(sum === undefined ? {} : { sum }),
        ...(productRows.length ? { productRows } : {}),
        summary: describeSalesDocument(kinds, input.sources, sum),
    };
};
