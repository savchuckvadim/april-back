import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { BrandLogo } from '../../kit/brand/BrandLogo';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { companyInnLine } from '../../kit/lib/cover-details.util';
import { offerCoverContent } from '../../kit/lib/cover.util';
import { GARANT_PINK, ISKRA_PURPLE } from '../iskra.theme';
import { iskraCoverStyles } from './iskra-cover.styles';

/** Верх титульника «Искры»: логотипы Гаранта и Искры, под ними наша компания с ИНН */
export const IskraCoverBrand: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = iskraCoverStyles(theme);
    const logos = model.assets?.logos;
    const company = companyInnLine(offerCoverContent(model));

    return (
        <>
            <View style={styles.logos}>
                <BrandLogo
                    logo={logos?.garant}
                    color={GARANT_PINK}
                    height={28}
                />
                <View style={styles.logoGap} />
                <BrandLogo
                    logo={logos?.iscra}
                    color={ISKRA_PURPLE}
                    height={24}
                />
            </View>
            {company ? <Text style={styles.company}>{company}</Text> : null}
        </>
    );
};
