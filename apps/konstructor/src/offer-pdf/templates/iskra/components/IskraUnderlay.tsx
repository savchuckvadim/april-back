import type { FC } from 'react';
import { StyleSheet } from '@react-pdf/renderer';
import { CornerImage } from '../../kit/decor/CornerImage';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { ISKRA_ASSETS } from '../iskra.theme';

/** Пламя у правого края: в поле листа, под текст не заходит */
const styles = StyleSheet.create({
    flame: { position: 'absolute', right: 0, top: 300, width: 34, height: 81 },
});

/** Подложка листов «Искры»: язычок пламени в правом поле */
export const IskraUnderlay: FC<OfferPdfChromeProps> = ({ model }) => (
    <CornerImage
        image={model.assets?.images[ISKRA_ASSETS.flame]}
        style={styles.flame}
    />
);
