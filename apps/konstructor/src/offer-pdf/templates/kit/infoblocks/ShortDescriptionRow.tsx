import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { InfoblockName } from './InfoblockName';
import { infoblocksStyles } from './infoblocks.styles';

export interface ShortDescriptionRowProps {
    name: string;
    description: string;
    theme: OfferPdfTheme;
}

/** Короткая строка «название | описание»: неразрывная, переезжает целиком. */
export const ShortDescriptionRow: FC<ShortDescriptionRowProps> = ({
    name,
    description,
    theme,
}) => {
    const styles = infoblocksStyles(theme);
    return (
        <View style={styles.tr} wrap={false}>
            <View style={[styles.td, styles.tdName]}>
                <InfoblockName name={name} theme={theme} />
            </View>
            <View style={[styles.td, styles.tdFill, styles.tdLast]}>
                <Text style={styles.tdDescText}>{description}</Text>
            </View>
        </View>
    );
};
