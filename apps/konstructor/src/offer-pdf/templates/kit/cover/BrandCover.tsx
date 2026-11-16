import type { FC, ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { BrandLogo } from '../brand/BrandLogo';
import type { OfferPdfChromeProps } from '../document/offer-pdf-chrome';
import { offerCoverContent } from '../lib/cover.util';
import { COVER_LOGO_HEIGHT, type BrandCoverStyles } from './brand-cover.styles';
import { CoverPeople } from './CoverPeople';

export interface BrandCoverProps extends OfferPdfChromeProps {
    /** Расстановка — стили титульника стиля (brandCoverStyles) */
    styles: BrandCoverStyles;
    /** Фон листа: картинка (SheetBackground) или вектор стиля */
    background?: ReactNode;
    /** Свой верх листа вместо логотипа Гаранта с нашей компанией */
    top?: ReactNode;
    /** Цвет логотипа Гаранта; по умолчанию — насыщенный акцент гаммы */
    logoColor?: string;
    logoHeight?: number;
    /** Добавки стиля в заголовок: перед комплектом, после него, после поставки */
    beforeProduct?: ReactNode;
    afterProduct?: ReactNode;
    afterSupply?: ReactNode;
}

/**
 * Титульник по образцу вордовских шаблонов: фон стиля, логотип Гаранта и
 * наша компания, комплект крупно и поставка, внизу — для кого с ИНН и кто
 * подготовил. Своё стиль добавляет слотами.
 */
export const BrandCover: FC<BrandCoverProps> = ({
    model,
    theme,
    styles,
    background,
    top,
    logoColor,
    logoHeight = COVER_LOGO_HEIGHT,
    beforeProduct,
    afterProduct,
    afterSupply,
}) => {
    const cover = offerCoverContent(model);
    return (
        <>
            {background}
            {top ?? (
                <View style={styles.top}>
                    <BrandLogo
                        logo={model.assets?.logos.garant}
                        color={
                            logoColor ??
                            theme.colors.accentStrong ??
                            theme.colors.accent
                        }
                        height={logoHeight}
                    />
                    {cover.company ? (
                        <Text style={styles.company}>{cover.company}</Text>
                    ) : null}
                </View>
            )}
            <View style={styles.main}>
                <Text style={styles.kicker}>
                    Коммерческое предложение · {cover.date}
                </Text>
                {beforeProduct}
                {cover.product ? (
                    <Text style={styles.product}>{cover.product}</Text>
                ) : null}
                {afterProduct}
                {cover.supply ? (
                    <Text style={styles.supply}>{cover.supply}</Text>
                ) : null}
                {afterSupply}
            </View>
            <CoverPeople cover={cover} styles={styles} />
        </>
    );
};
