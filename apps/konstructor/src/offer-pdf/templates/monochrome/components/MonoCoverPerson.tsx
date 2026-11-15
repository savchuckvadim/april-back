import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { monoCoverStyles } from './mono-cover.styles';

export interface MonoCoverPersonProps {
    label: string;
    value: string;
    /** Строка под именем: ИНН, телефон и почта; пустая не печатается */
    detail?: string;
    /** Крупно — главный адресат титульника */
    large?: boolean;
    theme: OfferPdfTheme;
}

/** «Подготовлено для» / «Подготовил»: подпись капсом, имя, строка деталей */
export const MonoCoverPerson: FC<MonoCoverPersonProps> = ({
    label,
    value,
    detail,
    large = false,
    theme,
}) => {
    const styles = monoCoverStyles(theme);
    return (
        <View>
            <Text style={styles.label}>{label}</Text>
            <Text style={large ? styles.valueLarge : styles.value}>
                {value}
            </Text>
            {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
    );
};
