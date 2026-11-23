import type { ProductRowDto } from '../dto/product-row/product-row.dto';

/** Общий набор — то, что предлагают купить; набор для сравнения — вариант рядом с ним */
export type ProductSetKind = 'general' | 'alternative';

/** Значение `type` строки, которое фронт ставит у строк наборов для сравнения */
export const ALTERNATIVE_ROW_TYPE = 'alternative';

/** Номер общего набора: наборы для сравнения нумеруются с 1 */
export const GENERAL_SET_NUMBER = 0;

/** Признаки набора у строки таблицы цен */
export interface ProductSetMarks {
    kind: ProductSetKind;
    /** 0 — общий набор, 1..N — наборы для сравнения */
    number: number;
    /** Пусто у общего набора, «Набор N» у набора для сравнения */
    title: string;
    /** Первая строка набора для сравнения: перед ней печатается заголовок набора */
    isFirstRow: boolean;
}

/** Часть строки, по которой определяется набор; старый клиент не шлёт ни одно из полей */
export type ProductSetRowSource = Partial<
    Pick<ProductRowDto, 'type' | 'setId'>
>;

/** Заголовок набора для сравнения */
export const productSetTitle = (number: number): string => `Набор ${number}`;

/** Номер набора для сравнения из `setId`: целое от 1; иначе null */
const alternativeNumber = (setId: number | null | undefined): number | null =>
    typeof setId === 'number' && Number.isInteger(setId) && setId >= 1
        ? setId
        : null;

/**
 * Признаки набора у каждой строки таблицы цен, в порядке строк.
 *
 * Фронт шлёт все строки одним массивом: сначала общий набор, затем наборы
 * для сравнения по порядку, у строки `type` (`general` | `alternative`) и
 * `setId`. Строка без `type` (старый клиент) принадлежит общему набору.
 * У строки набора для сравнения без номера набор тот же, что у предыдущей
 * такой строки, а в начале — первый.
 */
export const getProductSetMarks = (
    rows: readonly ProductSetRowSource[],
): ProductSetMarks[] => {
    const marks: ProductSetMarks[] = [];
    // номер набора предыдущей строки; 0 — строки общего набора или строк ещё не было
    let previousAlternative = GENERAL_SET_NUMBER;

    for (const row of rows) {
        if (row.type !== ALTERNATIVE_ROW_TYPE) {
            marks.push({
                kind: 'general',
                number: GENERAL_SET_NUMBER,
                title: '',
                isFirstRow: false,
            });
            previousAlternative = GENERAL_SET_NUMBER;
            continue;
        }
        const number =
            alternativeNumber(row.setId) ?? (previousAlternative || 1);
        marks.push({
            kind: 'alternative',
            number,
            title: productSetTitle(number),
            isFirstRow: previousAlternative !== number,
        });
        previousAlternative = number;
    }

    return marks;
};
