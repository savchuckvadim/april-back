import type { FC } from 'react';
import {
    Defs,
    LinearGradient,
    RadialGradient,
    Rect,
    Stop,
    Svg,
} from '@react-pdf/renderer';

export interface SoftGradientProps {
    width: number;
    height: number;
    /** Цвета от → до */
    colors: readonly [string, string];
    /**
     * diagonal — по диагонали листа (титульник); fade-down — слева
     * направо и вниз уходит в белый лист (полоса-шапка)
     */
    direction: 'diagonal' | 'fade-down';
    /** Префикс id градиентов: на листе их бывает несколько */
    id: string;
    /** Светлое пятно под текстом слева — читаемость на титульнике */
    glow?: boolean;
}

/**
 * Мягкий градиент вектором: цвета из темы, без картинки, печатается чётко
 * и весит байты.
 */
export const SoftGradient: FC<SoftGradientProps> = ({
    width,
    height,
    colors,
    direction,
    id,
    glow = false,
}) => {
    const [from, to] = colors;
    const fade = direction === 'fade-down';
    return (
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <Defs>
                <LinearGradient
                    id={`${id}-base`}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2={fade ? '0' : '1'}
                >
                    <Stop offset="0%" stopColor={from} />
                    <Stop offset="100%" stopColor={to} />
                </LinearGradient>
                <LinearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0} />
                    <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={1} />
                </LinearGradient>
                <RadialGradient id={`${id}-glow`} cx="0.3" cy="0.45" r="0.55">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.75} />
                    <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill={`url(#${id}-base)`}
            />
            {fade ? (
                <Rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill={`url(#${id}-fade)`}
                />
            ) : null}
            {glow ? (
                <Rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill={`url(#${id}-glow)`}
                />
            ) : null}
        </Svg>
    );
};
