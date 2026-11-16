import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { BrandLogo } from '../../kit/brand/BrandLogo';
import { CoverPerson } from '../../kit/cover/CoverPerson';
import { SoftGradient } from '../../kit/decor/SoftGradient';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import {
    managerContactsLine,
    recipientInnLine,
} from '../../kit/lib/cover-details.util';
import { offerCoverContent } from '../../kit/lib/cover.util';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { lavenderCoverStyles } from './lavender-cover.styles';

/**
 * Титульник «Лаванды»: весь лист в мягком градиенте гаммы со светлым
 * пятном под текстом; логотип Гаранта в цвет гаммы, комплект крупно,
 * внизу за чертой — для кого и кто подготовил.
 */
export const LavenderCover: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = lavenderCoverStyles(theme);
    const cover = offerCoverContent(model);
    const gradient = theme.colors.gradient;

    return (
        <>
            {gradient ? (
                <View style={styles.gradient}>
                    <SoftGradient
                        id="lavender-cover"
                        width={A4.width}
                        height={A4.height}
                        colors={gradient}
                        direction="diagonal"
                        glow
                    />
                </View>
            ) : null}
            <View style={styles.top}>
                <BrandLogo
                    logo={model.assets?.logos.garant}
                    color={theme.colors.accentStrong ?? theme.colors.accent}
                    height={28}
                />
                {cover.company ? (
                    <Text style={styles.company}>{cover.company}</Text>
                ) : null}
            </View>
            <View style={styles.main}>
                <Text style={styles.kicker}>
                    Коммерческое предложение · {cover.date}
                </Text>
                {cover.product ? (
                    <Text style={styles.product}>{cover.product}</Text>
                ) : null}
                {cover.supply ? (
                    <Text style={styles.supply}>{cover.supply}</Text>
                ) : null}
            </View>
            <View style={styles.bottom}>
                {cover.recipient ? (
                    <CoverPerson
                        label="Подготовлено для"
                        value={cover.recipient}
                        detail={recipientInnLine(cover)}
                        styles={styles}
                    />
                ) : null}
                {cover.manager ? (
                    <CoverPerson
                        label="Подготовил"
                        value={cover.manager.name}
                        detail={managerContactsLine(cover)}
                        styles={styles}
                    />
                ) : null}
            </View>
        </>
    );
};
