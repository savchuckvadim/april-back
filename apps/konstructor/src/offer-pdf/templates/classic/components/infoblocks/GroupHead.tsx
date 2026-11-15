import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { infoblocksStyles as styles } from './infoblocks.styles';

export interface GroupHeadProps {
    name: string;
}

/** Шапка группы в таблице — строка на всю ширину с подложкой */
export const GroupHead: FC<GroupHeadProps> = ({ name }) => (
    <View style={[styles.tr, styles.trGroup]} wrap={false}>
        <View style={[styles.td, styles.tdFill, styles.tdLast]}>
            <Text style={styles.groupCell}>{name}</Text>
        </View>
    </View>
);
