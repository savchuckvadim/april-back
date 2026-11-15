import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { InfoblockName } from './InfoblockName';
import { infoblocksStyles as styles } from './infoblocks.styles';

export interface ShortDescriptionRowProps {
    name: string;
    description: string;
}

/** Короткая строка «название | описание»: неразрывная, переезжает целиком. */
export const ShortDescriptionRow: FC<ShortDescriptionRowProps> = ({
    name,
    description,
}) => (
    <View style={styles.tr} wrap={false}>
        <View style={[styles.td, styles.tdName]}>
            <InfoblockName name={name} />
        </View>
        <View style={[styles.td, styles.tdFill, styles.tdLast]}>
            <Text style={styles.tdDescText}>{description}</Text>
        </View>
    </View>
);
