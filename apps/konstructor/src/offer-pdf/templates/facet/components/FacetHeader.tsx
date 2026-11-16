import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { BrandLogo } from '../../kit/brand/BrandLogo';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';
import {
    HEADER_BAND,
    HEADER_FACETS,
    HEADER_FACETS_WIDTH,
} from '../lib/facet-shapes.util';
import { FacetShapes } from './FacetShapes';

const headerStyles = themedStyles(({ colors, sizes, page, lineHeight }) =>
    StyleSheet.create({
        band: {
            fontSize: sizes.base,
            lineHeight,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: HEADER_BAND,
            backgroundColor: colors.coverPaper ?? colors.accent,
        },
        facets: { position: 'absolute', top: 0, left: 0 },
        row: {
            position: 'absolute',
            top: 0,
            left: page.paddingHorizontal,
            right: HEADER_FACETS_WIDTH + 8,
            height: HEADER_BAND,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        company: {
            maxWidth: '60%',
            marginLeft: 10,
            fontSize: sizes.sm,
            color: colors.coverText ?? '#FFFFFF',
        },
        brand: { flexDirection: 'row', alignItems: 'center', maxWidth: '65%' },
        doc: {
            fontSize: sizes.xs,
            color: colors.coverText ?? '#FFFFFF',
            textAlign: 'right',
        },
    }),
);

/** Шапка «Грани»: полоса в цвет гаммы — логотип и компания слева, грани справа */
export const FacetHeader: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = headerStyles(theme);
    const company = model.data.MyCompanyName || model.data.MyCompanyFullName;
    const textColor = theme.colors.coverText ?? '#FFFFFF';

    return (
        <View fixed style={styles.band}>
            <View style={styles.facets}>
                <FacetShapes
                    facets={HEADER_FACETS}
                    width={A4.width}
                    height={HEADER_BAND}
                    theme={theme}
                />
            </View>
            <View style={styles.row}>
                <View style={styles.brand}>
                    <BrandLogo
                        logo={model.assets?.logos.garant}
                        color={textColor}
                        height={18}
                    />
                    {company ? (
                        <Text style={styles.company}>{company}</Text>
                    ) : null}
                </View>
                <Text style={styles.doc}>{model.meta.date}</Text>
            </View>
        </View>
    );
};
