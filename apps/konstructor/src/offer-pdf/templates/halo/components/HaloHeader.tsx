import type { FC } from 'react';
import { StyleSheet, View } from '@react-pdf/renderer';
import { BrandHeader } from '../../kit/chrome/BrandHeader';
import { GradientLine } from '../../kit/decor/GradientLine';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { contentWidth } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';
import { HALO_LINE_HEIGHT } from '../halo.theme';

const styles = themedStyles(({ page }) =>
    StyleSheet.create({
        line: {
            position: 'absolute',
            top: page.edge + 26,
            left: page.paddingHorizontal,
        },
    }),
);

/** Шапка «Ореола»: логотип, компания, дата и коралловая черта под ними */
export const HaloHeader: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <>
        <BrandHeader model={model} theme={theme} />
        <View fixed style={styles(theme).line}>
            <GradientLine
                id="halo-header"
                width={contentWidth(theme)}
                height={HALO_LINE_HEIGHT}
                colors={theme.colors.gradient}
            />
        </View>
    </>
);
