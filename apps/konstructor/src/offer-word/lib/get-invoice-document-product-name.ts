import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { InvoiceSetKind } from '../types/invoice-set.types';

/** Строка Гаранта в том минимуме, который нужен имени счёта. */
type InvoiceNameRow = Pick<ProductRowDto, 'name' | 'alternativeName'> & {
    supply?: { name?: string };
};

/** Наборы запроса: любой тип строк в наборе может отсутствовать. */
type InvoiceNameSets = {
    [kind in InvoiceSetKind]?: Array<
        { rows?: { garant?: InvoiceNameRow[] } } | undefined
    >;
};

/**
 * Имя счёта в списке документов: «Счёт {alternativeName || name} - {supply.name}».
 *
 * Имя берётся из набора, из которого собран счёт: для `general` — по первой
 * строке Гаранта набора `sets.general[setIndex]`, для `alternative` — по
 * первой строке Гаранта набора `sets.alternative[setIndex]`.
 *
 * Строки Гаранта в наборе нет — запасное имя по месту счёта в списке:
 * «Счёт» для первого, «Счёт - N» для следующих (`position` — номер счёта в
 * списке с нуля). Слово «Счёт» пишется кириллицей.
 */
export const getInvoiceDocumentProductName = (
    dto: { sets?: InvoiceNameSets },
    setKind: InvoiceSetKind,
    setIndex: number,
    position: number,
): string => {
    const firstRow = dto.sets?.[setKind]?.[setIndex]?.rows?.garant?.[0];
    if (!firstRow) {
        return position === 0 ? 'Счёт' : `Счёт - ${position}`;
    }
    const productName = firstRow.alternativeName || firstRow.name;
    const supplyName = firstRow.supply?.name || '';

    return `Счёт ${productName} - ${supplyName}`;
};
