import type { FC } from 'react';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { CLASSIC_THEME } from '../classic.theme';
import { joinNonEmpty } from '../classic.util';

const { colors, sizes, page } = CLASSIC_THEME;

const styles = StyleSheet.create({
    header: {
        position: 'absolute',
        top: page.edge,
        left: page.paddingHorizontal,
        right: page.paddingHorizontal,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottomWidth: 1,
        borderBottomColor: colors.accent,
        paddingBottom: 6,
    },
    rq: { maxWidth: '72%' },
    company: {
        fontSize: sizes.lg,
        fontWeight: 'bold',
        color: colors.accent,
        marginBottom: 1,
    },
    line: { fontSize: sizes.xs, color: colors.muted },
    logo: { height: 36, maxWidth: 140, objectFit: 'contain' },
});

/** Шапка на каждой странице: реквизиты поставщика слева, логотип справа. */
export const ClassicHeader: FC<{ model: OfferPdfDocumentModel }> = ({
    model,
}) => {
    const { data, images } = model;
    const company = data.MyCompanyName || data.MyCompanyFullName;
    const codes = joinNonEmpty([
        data.MyCompanyINN ? `ИНН ${data.MyCompanyINN}` : '',
        data.MyCompanyKPP ? `КПП ${data.MyCompanyKPP}` : '',
    ]);
    const address = data.MyCompanyPrimaryAddress || data.MyCompanyAddress;
    const contacts = joinNonEmpty([data.MyCompanyPhone, data.MyCompanyEmail]);

    return (
        <View fixed style={styles.header}>
            <View style={styles.rq}>
                {company ? <Text style={styles.company}>{company}</Text> : null}
                {codes ? <Text style={styles.line}>{codes}</Text> : null}
                {address ? <Text style={styles.line}>{address}</Text> : null}
                {contacts ? <Text style={styles.line}>{contacts}</Text> : null}
            </View>
            {images.logo ? (
                <Image style={styles.logo} src={images.logo} />
            ) : null}
        </View>
    );
};
