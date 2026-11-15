import type { FC } from 'react';
import { Circle, Path, Svg } from '@react-pdf/renderer';
import { MONO_CHIP } from './mono.styles';

export interface MonoArrowProps {
    color: string;
    size?: number;
}

/** Кружок со стрелкой «↗» рядом с таблеткой — вектором, без глифа шрифта */
export const MonoArrow: FC<MonoArrowProps> = ({ color, size = MONO_CHIP }) => {
    const radius = size / 2;
    const near = size * 0.36;
    const far = size * 0.64;
    return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Circle
                cx={radius}
                cy={radius}
                r={radius - 0.5}
                stroke={color}
                strokeWidth={0.75}
                fill="none"
            />
            <Path
                d={`M ${near} ${far} L ${far} ${near} M ${near + 1.5} ${near} L ${far} ${near} L ${far} ${far - 1.5}`}
                stroke={color}
                strokeWidth={0.9}
                fill="none"
            />
        </Svg>
    );
};
