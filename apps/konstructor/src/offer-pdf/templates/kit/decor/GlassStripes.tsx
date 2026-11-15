import type { FC } from 'react';
import { Defs, LinearGradient, Rect, Stop, Svg } from '@react-pdf/renderer';
import { GLASS_STOPS, glassStripes } from './glass-stripes.util';

export interface GlassStripesProps {
    width: number;
    height: number;
    /** Цвет, в который полосы уходят посередине */
    accent: string;
    /** Цвет верха и низа полос */
    base: string;
    count: number;
    /** 1 — титульник, ~0.3 — подложка под текстом */
    intensity: number;
    /** Префикс id градиентов: на одном листе бывает несколько полос */
    id: string;
}

/**
 * Вертикальные полосы «рифлёного стекла» вектором: цвет — градиентом сверху
 * вниз, рёбра — белым бликом у левого края каждой полосы. Цвет из темы, так
 * что полосы перекрашиваются под бренд без новых картинок.
 */
export const GlassStripes: FC<GlassStripesProps> = ({
    width,
    height,
    accent,
    base,
    count,
    intensity,
    id,
}) => {
    const stripes = glassStripes(width, count, intensity);
    return (
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <Defs>
                <LinearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
                    {GLASS_STOPS.map(stop => (
                        <Stop
                            key={stop.offset}
                            offset={stop.offset}
                            stopColor={stop.color === 'accent' ? accent : base}
                            stopOpacity={stop.opacity}
                        />
                    ))}
                </LinearGradient>
                <LinearGradient id={`${id}-rib`} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.55} />
                    <Stop offset="45%" stopColor="#FFFFFF" stopOpacity={0} />
                    <Stop
                        offset="100%"
                        stopColor="#FFFFFF"
                        stopOpacity={0.12}
                    />
                </LinearGradient>
            </Defs>
            {stripes.map(stripe => (
                <Rect
                    key={`band-${stripe.x}`}
                    x={stripe.x}
                    y={0}
                    width={stripe.width}
                    height={height}
                    fill={`url(#${id}-band)`}
                    opacity={stripe.opacity}
                />
            ))}
            {stripes.map(stripe => (
                <Rect
                    key={`rib-${stripe.x}`}
                    x={stripe.x}
                    y={0}
                    width={stripe.width}
                    height={height}
                    fill={`url(#${id}-rib)`}
                    opacity={Math.min(1, stripe.opacity * 1.2)}
                />
            ))}
        </Svg>
    );
};
