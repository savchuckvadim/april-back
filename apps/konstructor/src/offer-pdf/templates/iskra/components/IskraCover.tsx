import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import { BrandCover } from '../../kit/cover/BrandCover';
import { CornerImage } from '../../kit/decor/CornerImage';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { ISKRA_ASSETS, ISKRA_COVER_TITLE } from '../iskra.theme';
import { iskraCoverStyles } from './iskra-cover.styles';
import { IskraCoverBrand } from './IskraCoverBrand';

/**
 * Титульник «Искры» по вордовскому шаблону: логотипы Гаранта и Искры,
 * наша компания с ИНН, «Правовой AI-ассистент ИСКРА», комплект и поставка,
 * для кого и кто подготовил; справа снизу — оранжевый узел.
 */
export const IskraCover: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = iskraCoverStyles(theme);

    return (
        <BrandCover
            model={model}
            theme={theme}
            styles={styles}
            background={
                <CornerImage
                    image={model.assets?.images[ISKRA_ASSETS.knot]}
                    style={styles.knot}
                />
            }
            top={<IskraCoverBrand model={model} theme={theme} />}
            beforeProduct={
                <Text style={styles.title}>{ISKRA_COVER_TITLE}</Text>
            }
        />
    );
};
