import { A4, type OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { strongAccent } from '../../kit/theme/theme-colors.util';

export type FacetTone = 'accent' | 'strong' | 'light';

type FacetPoints = ReadonlyArray<readonly [number, number]>;

/** Грань: многоугольник в координатах листа или полосы шапки */
export interface Facet {
    /** Путь SVG — считается один раз, при объявлении грани */
    d: string;
    /** Цвет берётся из темы */
    tone: FacetTone;
    opacity: number;
}

/** Цвет грани из темы: насыщенный, акцент или белый блик */
export const facetColor = (tone: FacetTone, theme: OfferPdfTheme): string => {
    if (tone === 'strong') return strongAccent(theme);
    if (tone === 'light') return '#FFFFFF';
    return theme.colors.accent;
};

/** Многоугольник → путь SVG */
export const polygonPath = (points: FacetPoints): string =>
    `${points
        .map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`)
        .join(' ')} Z`;

const facet = (
    points: FacetPoints,
    tone: FacetTone,
    opacity: number,
): Facet => ({ d: polygonPath(points), tone, opacity });

const { width: W, height: H } = A4;

/**
 * Грани титульника: треугольники в правом верхнем и левом нижнем углах,
 * середина листа свободна под текст. Тонкая светлая диагональ связывает углы.
 */
export const COVER_FACETS: readonly Facet[] = [
    facet(
        [
            [W - 250, 0],
            [W, 0],
            [W, 270],
        ],
        'accent',
        0.55,
    ),
    facet(
        [
            [W - 140, 0],
            [W, 0],
            [W, 160],
        ],
        'strong',
        0.95,
    ),
    facet(
        [
            [W, 200],
            [W, 380],
            [W - 120, 290],
        ],
        'accent',
        0.3,
    ),
    facet(
        [
            [0, H - 300],
            [0, H],
            [280, H],
        ],
        'accent',
        0.45,
    ),
    facet(
        [
            [0, H - 150],
            [0, H],
            [150, H],
        ],
        'strong',
        0.95,
    ),
    facet(
        [
            [W - 6, 0],
            [W - 4, 0],
            [4, H],
            [2, H],
        ],
        'light',
        0.12,
    ),
];

/** Высота полосы-шапки внутренних листов */
export const HEADER_BAND = 56;

/** Грани полосы-шапки: у правого края, правее текста шапки */
export const HEADER_FACETS: readonly Facet[] = [
    facet(
        [
            [W - 150, 0],
            [W, 0],
            [W, HEADER_BAND],
            [W - 110, HEADER_BAND],
        ],
        'accent',
        0.6,
    ),
    facet(
        [
            [W - 70, 0],
            [W, 0],
            [W, HEADER_BAND],
            [W - 40, HEADER_BAND],
        ],
        'strong',
        0.95,
    ),
];

/** Сколько места справа в шапке занимают грани */
export const HEADER_FACETS_WIDTH = 150;
