import type { FC } from 'react';
import { Image, Text, View } from '@react-pdf/renderer';
import { stampsStyles } from '../../templates/kit/stamps/stamps.styles';
import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import type { InvoicePdfModel } from '../model/invoice-pdf.model';
import { invoiceStyles } from './invoice-pdf.styles';

export interface InvoiceSignaturesProps {
    model: InvoicePdfModel;
    theme: OfferPdfTheme;
}

/** Высота места под подпись бухгалтера: подпись 40 и воздух вокруг. */
const ACCOUNTANT_SIGN_AREA = { height: 48 } as const;

/**
 * Подписи и печать счёта. Руководитель: должность с названием поставщика,
 * подпись под печатью, расшифровка. Главный бухгалтер печатается, когда он
 * указан в реквизитах и загружена его подпись, как в легаси. Без подписанта
 * блока нет (настройка «с печатями и подписями» выключена или в реквизитах
 * нечего печатать).
 */
export const InvoiceSignatures: FC<InvoiceSignaturesProps> = ({
    model,
    theme,
}) => {
    const { signer, images } = model;
    if (!signer) return null;
    const styles = stampsStyles(theme);
    const { bold } = invoiceStyles(theme);
    const withImages = Boolean(images.stamp || images.signatureDirector);
    const withAccountant = Boolean(
        signer.accountant && images.signatureAccountant,
    );

    return (
        <View wrap={false}>
            <View style={styles.stamps}>
                <View style={styles.side}>
                    <Text style={bold}>{signer.position}</Text>
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
                    {images.signatureDirector ? (
                        <Image
                            style={styles.signature}
                            src={images.signatureDirector}
                        />
                    ) : (
                        <Text style={styles.signLine}>________________</Text>
                    )}
                </View>
                <View style={styles.sideRight}>
                    <Text style={[bold, styles.text]}>{signer.director}</Text>
                </View>
            </View>
            {withAccountant && images.signatureAccountant ? (
                <View style={styles.stamps}>
                    <View style={styles.side}>
                        <Text style={bold}>Главный бухгалтер</Text>
                    </View>
                    <View style={[styles.middle, ACCOUNTANT_SIGN_AREA]}>
                        <Image
                            style={styles.signature}
                            src={images.signatureAccountant}
                        />
                    </View>
                    <View style={styles.sideRight}>
                        <Text style={[bold, styles.text]}>
                            {signer.accountant}
                        </Text>
                    </View>
                </View>
            ) : null}
        </View>
    );
};
