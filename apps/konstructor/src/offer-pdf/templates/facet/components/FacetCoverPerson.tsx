import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { facetCoverStyles } from './facet-cover.styles';

export interface FacetCoverPersonProps {
    label: string;
    value: string;
    /** ИНН, контакты; пустая строка не печатается */
    detail?: string;
    theme: OfferPdfTheme;
}

/** «Подготовлено для» / «Подготовил» на тёмном титульнике */
export const FacetCoverPerson: FC<FacetCoverPersonProps> = ({
    label,
    value,
    detail,
    theme,
}) => {
    const styles = facetCoverStyles(theme);
    return (
        <View style={styles.person}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
            {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
    );
};
