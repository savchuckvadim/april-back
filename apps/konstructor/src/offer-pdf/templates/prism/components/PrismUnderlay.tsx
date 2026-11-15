import type { FC } from 'react';
import { StyleSheet, View } from '@react-pdf/renderer';
import { GlassStripes } from '../../kit/decor/GlassStripes';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { PRISM_STRIPE_BASE } from '../prism.theme';

/** Полосы у правого края — в поле листа, под текст не заходят */
const UNDERLAY_WIDTH = 30;

const styles = StyleSheet.create({
    underlay: { position: 'absolute', top: 0, right: 0 },
});

/** Подложка каждой страницы: те же полосы, что на титульнике, но бледнее и узкой лентой у края. */
export const PrismUnderlay: FC<OfferPdfChromeProps> = ({ theme }) => (
    <View fixed style={styles.underlay}>
        <GlassStripes
            id="underlay"
            width={UNDERLAY_WIDTH}
            height={A4.height}
            accent={theme.colors.accent}
            base={PRISM_STRIPE_BASE}
            count={4}
            intensity={0.35}
        />
    </View>
);
