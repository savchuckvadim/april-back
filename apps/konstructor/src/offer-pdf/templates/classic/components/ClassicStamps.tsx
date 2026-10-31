import type { FC } from 'react';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { classicStyles } from '../classic.styles';
import { CLASSIC_THEME } from '../classic.theme';

const { colors, sizes } = CLASSIC_THEME;

const styles = StyleSheet.create({
    stamps: {
        marginTop: 18,
        flexDirection: 'row',
        alignItems: 'center',
    },
    side: { width: '34%', justifyContent: 'center' },
    sideRight: {
        width: '34%',
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    middle: {
        width: '32%',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    // Без картинок блок низкий — иначе он не влезал под итогом и
    // уезжал один на новую страницу.
    middleLine: { height: 36 },
    middleImages: { height: 96 },
    stamp: {
        position: 'absolute',
        top: 0,
        width: 92,
        height: 92,
        objectFit: 'contain',
    },
    signature: { width: 80, height: 40, objectFit: 'contain' },
    signLine: { fontSize: sizes.base, color: colors.muted },
    text: { fontSize: sizes.base, textAlign: 'right' },
});

/** Подпись руководителя и печать (картинки — когда появятся в реквизитах). */
export const ClassicStamps: FC<{ model: OfferPdfDocumentModel }> = ({
    model,
}) => {
    const { signer, images } = model;
    const withImages = Boolean(images.stamp || images.signature);
    if (!signer && !withImages) return null;

    return (
        <View style={styles.stamps} wrap={false}>
            <View style={styles.side}>
                <Text style={classicStyles.bold}>{signer?.position ?? ''}</Text>
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
                <Text style={[classicStyles.bold, styles.text]}>
                    {signer?.name ?? ''}
                </Text>
            </View>
        </View>
    );
};
