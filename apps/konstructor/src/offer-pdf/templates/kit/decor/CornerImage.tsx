import type { FC } from 'react';
import { Image } from '@react-pdf/renderer';
import type { OfferPdfImage } from '../../../model/offer-pdf-document.model';
import type { PdfStyle } from '../../shared/style.util';

export interface CornerImageProps {
    /** Картинка из model.assets.images; нет файла — ничего */
    image: OfferPdfImage | undefined;
    /** Положение и размер: position absolute, угол, ширина, высота */
    style: PdfStyle;
    /** Бледнее под текстом */
    opacity?: number;
}

/** Картинка в углу листа (fixed — на каждой странице): угловые пятна, 3D-элементы */
export const CornerImage: FC<CornerImageProps> = ({ image, style, opacity }) =>
    image ? (
        <Image
            fixed
            style={opacity === undefined ? style : [style, { opacity }]}
            src={image}
        />
    ) : null;
