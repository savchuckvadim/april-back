/**
 * Геометрия полос «рифлёного стекла»: вертикальные полосы, к краю листа
 * ярче, к тексту тают. Размытия в PDF нет — эффект собран из градиентов.
 */

export interface GlassStripe {
    x: number;
    width: number;
    /** Насыщенность полосы: у края листа 1, к тексту стремится к нулю */
    opacity: number;
}

/** Цветовая полоса сверху вниз: серый → акцент → растворение */
export interface GlassStop {
    offset: string;
    color: 'base' | 'accent';
    opacity: number;
}

export const GLASS_STOPS: readonly GlassStop[] = [
    { offset: '0%', color: 'base', opacity: 0 },
    { offset: '18%', color: 'base', opacity: 0.55 },
    { offset: '45%', color: 'accent', opacity: 0.95 },
    { offset: '62%', color: 'accent', opacity: 0.85 },
    { offset: '85%', color: 'accent', opacity: 0.25 },
    { offset: '100%', color: 'base', opacity: 0 },
];

/**
 * Полосы на ширине `width`: `count` штук, самая насыщенная — справа.
 * `intensity` гасит все сразу: на титульнике 1, в подложке страниц ~0.3.
 */
export const glassStripes = (
    width: number,
    count: number,
    intensity: number,
): GlassStripe[] => {
    const stripeWidth = width / count;
    return Array.from({ length: count }, (_, index) => {
        const towardEdge = count === 1 ? 1 : index / (count - 1);
        return {
            x: index * stripeWidth,
            width: stripeWidth,
            opacity: intensity * (0.12 + 0.88 * towardEdge ** 1.6),
        };
    });
};
