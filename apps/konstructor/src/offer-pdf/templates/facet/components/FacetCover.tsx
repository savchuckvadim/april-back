import type { FC } from 'react';
import { View } from '@react-pdf/renderer';
import { BrandCover } from '../../kit/cover/BrandCover';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { coverTextColor } from '../../kit/theme/theme-colors.util';
import { COVER_FACETS } from '../lib/facet-shapes.util';
import {
    FACET_COVER_LOGO_HEIGHT,
    facetCoverStyles,
} from './facet-cover.styles';
import { FacetShapes } from './FacetShapes';

/**
 * Титульник «Грани»: тёмный лист в цвет гаммы, грани в углах, белый
 * логотип Гаранта. Слева — комплект крупно, черта и поставка, справа
 * внизу — для кого с ИНН и кто подготовил.
 */
export const FacetCover: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = facetCoverStyles(theme);

    return (
        <BrandCover
            model={model}
            theme={theme}
            styles={styles}
            background={
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
                </>
            }
            logoColor={coverTextColor(theme)}
            logoHeight={FACET_COVER_LOGO_HEIGHT}
            afterProduct={<View style={styles.bar} />}
        />
    );
};
