import type { FC } from 'react';
import { Image, Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { stampsStyles } from './stamps.styles';

export interface OfferStampsProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
}

/** Подпись руководителя и печать (картинки — когда появятся в реквизитах). */
export const OfferStamps: FC<OfferStampsProps> = ({ model, theme }) => {
    const { signer, images } = model;
    const withImages = Boolean(images.stamp || images.signature);
    if (!signer && !withImages) return null;
    const styles = stampsStyles(theme);
    const { bold } = baseStyles(theme);

    return (
        <View style={styles.stamps} wrap={false}>
            <View style={styles.side}>
                <Text style={bold}>{signer?.position ?? ''}</Text>
            </View>
            <View
                style={[
                    styles.middle,
                    withImages ? styles.middleImages : styles.middleLine,
                ]}
            >
                {images.stamp ? (
                    <Image style={styles.stamp} src={images.stamp} />
                ) : null}
                {images.signature ? (
                    <Image style={styles.signature} src={images.signature} />
                ) : (
                    <Text style={styles.signLine}>________________</Text>
                )}
            </View>
            <View style={styles.sideRight}>
                <Text style={[bold, styles.text]}>{signer?.name ?? ''}</Text>
            </View>
        </View>
    );
};
