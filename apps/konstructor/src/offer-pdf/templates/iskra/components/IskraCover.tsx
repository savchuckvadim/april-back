import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { BrandLogo } from '../../kit/brand/BrandLogo';
import { CoverPerson } from '../../kit/cover/CoverPerson';
import { CornerImage } from '../../kit/decor/CornerImage';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import {
    companyInnLine,
    managerContactsLine,
    recipientInnLine,
} from '../../kit/lib/cover-details.util';
import { offerCoverContent } from '../../kit/lib/cover.util';
import {
    GARANT_PINK,
    ISKRA_ASSETS,
    ISKRA_COVER_TITLE,
    ISKRA_PURPLE,
} from '../iskra.theme';
import { iskraCoverStyles } from './iskra-cover.styles';

/**
 * Титульник «Искры» по вордовскому шаблону: логотипы Гаранта и Искры,
 * наша компания с ИНН, «Правовой AI-ассистент ИСКРА», комплект и поставка,
 * для кого и кто подготовил; справа снизу — оранжевый узел.
 */
export const IskraCover: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = iskraCoverStyles(theme);
    const cover = offerCoverContent(model);
    const knot = model.assets?.images[ISKRA_ASSETS.knot];
    const company = companyInnLine(cover);

    return (
        <>
            <CornerImage image={knot} style={styles.knot} />
            <View style={styles.logos}>
                <BrandLogo
                    logo={model.assets?.logos.garant}
                    color={GARANT_PINK}
                    height={28}
                />
                <View style={styles.logoGap} />
                <BrandLogo
                    logo={model.assets?.logos.iscra}
                    color={ISKRA_PURPLE}
                    height={24}
                />
            </View>
            {company ? <Text style={styles.company}>{company}</Text> : null}
            <View style={styles.main}>
                <Text style={styles.kicker}>
                    Коммерческое предложение · {cover.date}
                </Text>
                <Text style={styles.title}>{ISKRA_COVER_TITLE}</Text>
                {cover.product ? (
                    <Text style={styles.product}>{cover.product}</Text>
                ) : null}
                {cover.supply ? (
                    <Text style={styles.supply}>{cover.supply}</Text>
                ) : null}
            </View>
            <View style={styles.bottom}>
                {cover.recipient ? (
                    <CoverPerson
                        label="Подготовлено для"
                        value={cover.recipient}
                        detail={recipientInnLine(cover)}
                        styles={styles}
                    />
                ) : null}
                {cover.manager ? (
                    <CoverPerson
                        label="Подготовил"
                        value={cover.manager.name}
                        detail={managerContactsLine(cover)}
                        styles={styles}
                    />
                ) : null}
            </View>
        </>
    );
};
