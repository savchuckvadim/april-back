import { A4, type OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';

/** Грань: многоугольник в координатах листа или полосы шапки */
export interface Facet {
    points: ReadonlyArray<readonly [number, number]>;
    /** 'accent' | 'strong' | 'light' — цвет берётся из темы */
    tone: FacetTone;
    opacity: number;
}

export type FacetTone = 'accent' | 'strong' | 'light';

/** Цвет грани из темы: насыщенный, акцент или белый блик */
export const facetColor = (tone: FacetTone, theme: OfferPdfTheme): string => {
    const { accent, accentStrong } = theme.colors;
    if (tone === 'strong') return accentStrong ?? accent;
    if (tone === 'light') return '#FFFFFF';
    return accent;
};

/** Многоугольник → путь SVG */
export const polygonPath = (
    points: ReadonlyArray<readonly [number, number]>,
): string =>
    `${points
        .map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`)
        .join(' ')} Z`;

const { width: W, height: H } = A4;

/**
 * Грани титульника: треугольники в правом верхнем и левом нижнем углах,
 * середина листа свободна под текст. Тонкая светлая диагональ связывает углы.
 */
export const COVER_FACETS: readonly Facet[] = [
    {
        points: [
            [W - 250, 0],
            [W, 0],
            [W, 270],
        ],
        tone: 'accent',
        opacity: 0.55,
    },
    {
        points: [
            [W - 140, 0],
            [W, 0],
            [W, 160],
        ],
        tone: 'strong',
        opacity: 0.95,
    },
    {
        points: [
            [W, 200],
            [W, 380],
            [W - 120, 290],
        ],
        tone: 'accent',
        opacity: 0.3,
    },
    {
        points: [
            [0, H - 300],
            [0, H],
            [280, H],
        ],
        tone: 'accent',
        opacity: 0.45,
    },
    {
        points: [
            [0, H - 150],
            [0, H],
            [150, H],
        ],
        tone: 'strong',
        opacity: 0.95,
    },
    {
        points: [
            [W - 6, 0],
            [W - 4, 0],
            [4, H],
            [2, H],
        ],
        tone: 'light',
        opacity: 0.12,
    },
];

/** Высота полосы-шапки внутренних листов */
export const HEADER_BAND = 56;

/** Грани полосы-шапки: у правого края, правее текста шапки */
export const HEADER_FACETS: readonly Facet[] = [
    {
        points: [
            [W - 150, 0],
            [W, 0],
            [W, HEADER_BAND],
            [W - 110, HEADER_BAND],
        ],
        tone: 'accent',
        opacity: 0.6,
    },
    {
        points: [
            [W - 70, 0],
            [W, 0],
            [W, HEADER_BAND],
            [W - 40, HEADER_BAND],
        ],
        tone: 'strong',
        opacity: 0.95,
    },
];

/** Сколько места справа в шапке занимают грани */
export const HEADER_FACETS_WIDTH = 150;
