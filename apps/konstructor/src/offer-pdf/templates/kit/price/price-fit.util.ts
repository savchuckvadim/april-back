import type { OfferPdfTheme } from '../theme/offer-pdf-theme';

/**
 * Высота раздела «Стоимость» до раскладки — чтобы решить, встанет ли он на
 * лист письма целиком («сначала цена»). Оценка намеренно с запасом: лучше
 * лишний раз начать цены с нового листа, чем разорвать таблицу под письмом.
 */

/** Символов в строке колонки «Наименование» — меньше, чем помещается на деле */
const NAME_LINE_CHARS = 34;
/** Символов в строке подписи поставки под названием */
const SUPPLY_LINE_CHARS = 42;
/** Символов в строке фразы об акции (во всю ширину полосы) */
const PHRASE_LINE_CHARS = 88;
/** Вертикальные поля ячейки (сверху и снизу) и линия под строкой */
const CELL_FRAME = 9;
/** Отступ раздела, отступы заголовка и таблицы */
const SECTION_GAPS = 30;
/** Итог: сумма, «в месяц», налог и сумма прописью в две строки */
const TOTALS_LINES = 5;

export interface PriceBlockRow {
    ProductName: string;
    SupplyNameMarketing?: string;
}

export interface PriceBlockInput {
    rows: readonly PriceBlockRow[];
    withCaption: boolean;
    withTotals: boolean;
    salePhrase: string | null;
}

const linesOf = (text: string | undefined | null, perLine: number): number =>
    (text ?? '')
        .split('\n')
        .reduce(
            (sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)),
            0,
        );

/** Оценка высоты раздела «Стоимость» в пунктах */
export const estimatePriceBlockHeight = (
    theme: OfferPdfTheme,
    { rows, withCaption, withTotals, salePhrase }: PriceBlockInput,
): number => {
    const { sizes, lineHeight, surface } = theme;
    const line = (size: number): number => size * lineHeight;

    const heading = line(sizes.h2) + (withCaption ? line(sizes.sm) : 0);
    const head = line(sizes.sm) + CELL_FRAME;
    const body = rows.reduce(
        (sum, row) =>
            sum +
            CELL_FRAME +
            linesOf(row.ProductName, NAME_LINE_CHARS) * line(sizes.sm) +
            (row.SupplyNameMarketing
                ? linesOf(row.SupplyNameMarketing, SUPPLY_LINE_CHARS) *
                      line(sizes.xs) +
                  1
                : 0),
        0,
    );
    const totals = withTotals
        ? 8 + line(sizes.lg) + (TOTALS_LINES - 1) * line(sizes.sm)
        : 0;
    const phrase = salePhrase
        ? 8 + linesOf(salePhrase, PHRASE_LINE_CHARS) * line(sizes.base)
        : 0;
    const card = surface ? surface.padding * 2 : 0;

    return Math.ceil(
        SECTION_GAPS + card + heading + head + body + totals + phrase,
    );
};
