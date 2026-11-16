import type { FC } from 'react';
import { Defs, LinearGradient, Rect, Stop, Svg } from '@react-pdf/renderer';

export interface GradientLineProps {
    width: number;
    height: number;
    /** Цвета слева → направо */
    colors: readonly [string, string];
    /** id градиента: на листе черт бывает несколько */
    id: string;
}

/** Черта с градиентом слева направо — под шапкой, в подвале, под заголовком титульника */
export const GradientLine: FC<GradientLineProps> = ({
    width,
    height,
    colors,
    id,
}) => (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor={colors[0]} />
                <Stop offset="100%" stopColor={colors[1]} />
            </LinearGradient>
        </Defs>
        <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            rx={height / 2}
            fill={`url(#${id})`}
        />
    </Svg>
);
