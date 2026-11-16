import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { PdfStyle } from '../../shared/style.util';

/** Стили блока: их задаёт титульник стиля */
export interface CoverPersonStyles {
    block: PdfStyle;
    label: PdfStyle;
    value: PdfStyle;
    detail: PdfStyle;
}

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
    <View style={styles.block}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
);
