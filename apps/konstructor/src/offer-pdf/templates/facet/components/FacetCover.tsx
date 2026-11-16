import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { BrandLogo } from '../../kit/brand/BrandLogo';
import { CoverPerson } from '../../kit/cover/CoverPerson';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import {
    managerContactsLine,
    recipientInnLine,
} from '../../kit/lib/cover-details.util';
import { offerCoverContent } from '../../kit/lib/cover.util';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { COVER_FACETS } from '../lib/facet-shapes.util';
import { facetCoverStyles } from './facet-cover.styles';
import { FacetShapes } from './FacetShapes';

/**
 * Титульник «Грани»: тёмный лист в цвет гаммы, грани в углах, белый
 * логотип Гаранта. Слева — комплект крупно и поставка, справа внизу — для
 * кого с ИНН и кто подготовил.
 */
export const FacetCover: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = facetCoverStyles(theme);
    const cover = offerCoverContent(model);

    return (
        <>
            <View style={styles.paper} />
            <View style={styles.shapes}>
                <FacetShapes
                    facets={COVER_FACETS}
                    width={A4.width}
                    height={A4.height}
                    theme={theme}
                />
            </View>
            <View style={styles.top}>
                <BrandLogo
                    logo={model.assets?.logos.garant}
                    color={theme.colors.coverText ?? '#FFFFFF'}
                    height={30}
                />
                {cover.company ? (
                    <Text style={styles.company}>{cover.company}</Text>
                ) : null}
            </View>
            <View style={styles.main}>
                <Text style={styles.kicker}>
                    Коммерческое предложение · {cover.date}
                </Text>
                {cover.product ? (
                    <Text style={styles.product}>{cover.product}</Text>
                ) : null}
                <View style={styles.bar} />
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
