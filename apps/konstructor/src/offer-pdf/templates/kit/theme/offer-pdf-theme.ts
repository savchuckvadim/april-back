/**
 * Тема стиля КП: всё, чем стили отличаются в общих блоках (письмо, цена,
 * наполнение, подпись). Свою шапку, подвал, титульник и подложку стиль
 * рисует сам — см. OfferPdfChrome.
 */
export interface OfferPdfTheme {
    /** Код стиля — для кэша стилей и отладки */
    readonly code: string;
    readonly colors: {
        readonly text: string;
        readonly muted: string;
        readonly accent: string;
        readonly danger: string;
        readonly line: string;
        readonly shade: string;
        readonly tableBorder: string;
        /** Цвет листа; не задан — белый */
        readonly paper?: string;
    };
    readonly sizes: {
        readonly xs: number;
        readonly sm: number;
        readonly base: number;
        readonly lg: number;
        readonly h2: number;
        readonly h1: number;
    };
    readonly page: {
        /** Поля под шапку и подвал; длинные реквизиты раздвигают их (fitPageFrame) */
        readonly paddingTop: number;
        readonly paddingBottom: number;
        readonly paddingHorizontal: number;
        /** Отступ шапки/подвала от края листа */
        readonly edge: number;
    };
    /** Семейства зарегистрированных шрифтов (fonts/offer-pdf-fonts) */
    readonly fonts: {
        readonly body: string;
        readonly heading: string;
        /** Вес заголовков разделов; не задан — жирный */
        readonly headingWeight?: number;
    };
    readonly lineHeight: number;
}

/** Лист A4 в пунктах */
export const A4 = { width: 595.28, height: 841.89 } as const;

/** Ширина полосы набора темы */
export const contentWidth = (theme: OfferPdfTheme): number =>
    A4.width - theme.page.paddingHorizontal * 2;
