import type { FC } from 'react';
import { Image, StyleSheet } from '@react-pdf/renderer';
import type { OfferPdfImage } from '../../../model/offer-pdf-document.model';
import { A4 } from '../theme/offer-pdf-theme';

const styles = StyleSheet.create({
    sheet: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: A4.width,
        height: A4.height,
    },
});

export interface SheetBackgroundProps {
    /** Картинка из model.assets.images; нет файла — лист без фона */
    image: OfferPdfImage | undefined;
}

/**
 * Картинка во весь лист под текстом: на титульнике и подложкой каждой
 * страницы (fixed — повторяется на всех листах). Во всю высоту листа она
 * не считается ни шапкой, ни подвалом.
 */
export const SheetBackground: FC<SheetBackgroundProps> = ({ image }) =>
    image ? <Image fixed style={styles.sheet} src={image} /> : null;
