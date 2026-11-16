import type { FC } from 'react';
import { StyleSheet, View } from '@react-pdf/renderer';
import { BrandHeader } from '../../kit/chrome/BrandHeader';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { themedStyles } from '../../kit/theme/themed-styles';
import { HaloLine } from './HaloLine';

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
            <HaloLine theme={theme} id="halo-header" />
        </View>
    </>
);
