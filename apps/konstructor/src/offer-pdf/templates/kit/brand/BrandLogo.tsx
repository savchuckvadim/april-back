import type { FC } from 'react';
import { G, Path, Svg } from '@react-pdf/renderer';
import type { OfferPdfLogo } from '../../../model/offer-pdf-document.model';

export interface BrandLogoProps {
    /** Логотип из model.assets.logos; нет файла — ничего не рисуется */
    logo: OfferPdfLogo | undefined;
    /** Заливка: цвет гаммы, на тёмном — белый */
    color: string;
    height: number;
}

/** Логотип вектором одной заливкой — перекрашивается под гамму стиля */
export const BrandLogo: FC<BrandLogoProps> = ({ logo, color, height }) => {
    if (!logo) return null;
    const width = (height * logo.width) / logo.height;
    return (
        <Svg
            width={width}
            height={height}
            viewBox={`${logo.minX ?? 0} ${logo.minY ?? 0} ${logo.width} ${logo.height}`}
        >
            <G transform={logo.groupTransform}>
                {logo.paths.map((path, index) => (
                    <Path
                        // пути логотипа неизменны и без id — порядок и есть ключ
                        key={index}
                        d={path.d}
                        transform={path.transform}
                        fill={color}
                    />
                ))}
            </G>
        </Svg>
    );
};
