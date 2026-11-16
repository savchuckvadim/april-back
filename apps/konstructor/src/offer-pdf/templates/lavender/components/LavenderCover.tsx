import type { FC } from 'react';
import { View } from '@react-pdf/renderer';
import { BrandCover } from '../../kit/cover/BrandCover';
import { SoftGradient } from '../../kit/decor/SoftGradient';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { lavenderCoverStyles } from './lavender-cover.styles';

/**
 * Титульник «Лаванды»: весь лист в мягком градиенте гаммы со светлым
 * пятном под текстом; логотип Гаранта в цвет гаммы, комплект крупно,
 * внизу за чертой — для кого и кто подготовил.
 */
export const LavenderCover: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = lavenderCoverStyles(theme);
    const gradient = theme.colors.gradient;

    return (
        <BrandCover
            model={model}
            theme={theme}
            styles={styles}
            background={
                gradient ? (
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
                ) : null
            }
        />
    );
};
