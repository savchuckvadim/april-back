import {
    SALES_DOCUMENT_KIND,
    SalesDocumentKind,
} from '@lib/queue/constants/sales-document-event-job';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { generalRowsOf, SalesDocumentSource } from './sales-document-source';

/** Подпись документа в начале текста: КП со счётом называется по КП. */
const labelOf = (kinds: readonly SalesDocumentKind[]): string => {
    if (kinds.includes(SALES_DOCUMENT_KIND.offer)) return 'КП';
    if (kinds.includes(SALES_DOCUMENT_KIND.contract)) return 'Договор';
    if (kinds.includes(SALES_DOCUMENT_KIND.supply)) return 'Поставка';
    return 'Счёт';
};

/** Сумма для текста: тысячи через пробел, копейки запятой и только если они есть. */
export const formatRubles = (value: number): string => {
    const [integer, fraction] = value.toFixed(2).split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return fraction === '00' ? grouped : `${grouped},${fraction}`;
};

const clean = (value: string | null | undefined): string =>
    (value ?? '').trim();

/** Комплект документа: главная строка Гаранта общего набора, иначе первая строка. */
const leadRowOf = (source: SalesDocumentSource): ProductRowDto | undefined => {
    const garant = (source.sets?.general ?? [])
        .map(set => set?.rows?.garant?.[0])
        .find(row => Boolean(row));
    return garant ?? generalRowsOf(source)[0];
};

/** «Комплект, поставка» одного документа; пусто, когда назвать нечем. */
const titleOf = (source: SalesDocumentSource): string => {
    const row = leadRowOf(source);
    const complect =
        clean(row?.alternativeName) ||
        clean(row?.name) ||
        clean(source.title) ||
        clean(source.total?.name);
    const supply =
        clean(source.supply?.name) ||
        clean(row?.supply?.name) ||
        clean(source.total?.supply?.name);
    return [complect, supply].filter(Boolean).join(', ');
};

/**
 * Короткий текст для комментария и «Истории»: «КП: <комплект>, <поставка>,
 * <сумма> ₽». Документов несколько (по участнику): комплекты через «;», сумма
 * общая. Назвать нечем и суммы нет: только подпись документа.
 */
export const describeSalesDocument = (
    kinds: readonly SalesDocumentKind[],
    sources: readonly SalesDocumentSource[],
    sum: number | undefined,
): string => {
    const titles = [...new Set(sources.map(titleOf).filter(Boolean))];
    const parts = [
        titles.join('; '),
        sum === undefined ? '' : `${formatRubles(sum)} ₽`,
    ].filter(Boolean);
    return parts.length
        ? `${labelOf(kinds)}: ${parts.join(', ')}`
        : labelOf(kinds);
};
