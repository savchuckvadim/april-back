import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { hasSetTitle, type PriceSetTitleSource } from './price-set-title.util';

/**
 * Высота раздела «Стоимость» до раскладки — чтобы решить, встанет ли он на
 * лист письма целиком («сначала цена»). Оценка намеренно с запасом: лучше
 * лишний раз начать цены с нового листа, чем разорвать таблицу под письмом.
 */

/** Символов в строке колонки «Наименование» — меньше, чем помещается на деле */
const NAME_LINE_CHARS = 34;
/** Символов в строке подписи под названием: поставка и длинная формулировка меры */
const SUPPLY_LINE_CHARS = 42;
/** Символов в строке заголовка набора для сравнения (он идёт во всю ширину таблицы) */
const SET_TITLE_LINE_CHARS = 80;
/** Символов в строке фразы об акции (во всю ширину полосы) */
const PHRASE_LINE_CHARS = 88;
/** Вертикальные поля ячейки (сверху и снизу) и линия под строкой */
const CELL_FRAME = 9;
/** Отступ раздела, отступы заголовка и таблицы */
const SECTION_GAPS = 30;
/** Итог: сумма, «в месяц», налог и сумма прописью в две строки */
const TOTALS_LINES = 5;

export interface PriceBlockRow extends PriceSetTitleSource {
    ProductName: string;
    SupplyNameMarketing?: string;
    ProductMeasureCaption?: string;
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
    // строка-заголовок набора для сравнения: ячейка во всю ширину, текст жирным кеглем sm
    const setTitle = (row: PriceBlockRow): number =>
        hasSetTitle(row)
            ? CELL_FRAME +
              linesOf(row.ProductSetTitle, SET_TITLE_LINE_CHARS) *
                  line(sizes.sm)
            : 0;
    // подпись под названием (поставка, мера портала): кегль xs и один пункт отступа
    const subCaption = (text: string | undefined): number =>
        text ? linesOf(text, SUPPLY_LINE_CHARS) * line(sizes.xs) + 1 : 0;
    const body = rows.reduce(
        (sum, row) =>
            sum +
            setTitle(row) +
            CELL_FRAME +
            linesOf(row.ProductName, NAME_LINE_CHARS) * line(sizes.sm) +
            subCaption(row.SupplyNameMarketing) +
            subCaption(row.ProductMeasureCaption),
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
