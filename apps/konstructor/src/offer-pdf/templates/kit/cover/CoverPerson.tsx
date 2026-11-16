import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { BrandCoverStyles } from './brand-cover.styles';

/** Стили блока — под теми же именами, что в стилях титульника */
export type CoverPersonStyles = Pick<
    BrandCoverStyles,
    'person' | 'label' | 'value' | 'detail'
>;

export interface CoverPersonProps {
    label: string;
    value: string;
    /** ИНН, контакты; пустая строка не печатается */
    detail?: string;
    styles: CoverPersonStyles;
}

/** «Подготовлено для» / «Подготовил» на титульнике: подпись, имя, строка деталей */
export const CoverPerson: FC<CoverPersonProps> = ({
    label,
    value,
    detail,
    styles,
}) => (
    <View style={styles.person}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
);
