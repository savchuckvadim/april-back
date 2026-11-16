import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { BrandLogo } from '../brand/BrandLogo';
import type { OfferPdfChromeProps } from '../document/offer-pdf-chrome';
import { brandHeaderStyles } from './brand-header.styles';

export interface BrandHeaderProps extends OfferPdfChromeProps {
    /** Цвет логотипа Гаранта; по умолчанию — насыщенный акцент гаммы */
    logoColor?: string;
    /** Рядом — логотип Искры в своём цвете */
    iscraColor?: string;
    /** Дата справа; стиль, у которого справа картинка, её прячет */
    withDate?: boolean;
}

/**
 * Шапка листа: логотип Гаранта (и Искры), наша компания, дата. Fixed —
 * повторяется на каждом листе; фон под ней рисует подложка стиля.
 */
export const BrandHeader: FC<BrandHeaderProps> = ({
    model,
    theme,
    logoColor,
    iscraColor,
    withDate = true,
}) => {
    const styles = brandHeaderStyles(theme);
    const logos = model.assets?.logos;
    const company = model.data.MyCompanyName || model.data.MyCompanyFullName;
    return (
        <View fixed style={styles.row}>
            <View style={styles.brand}>
                <BrandLogo
                    logo={logos?.garant}
                    color={
                        logoColor ??
                        theme.colors.accentStrong ??
                        theme.colors.accent
                    }
                    height={18}
                />
                {iscraColor ? <View style={styles.logoGap} /> : null}
                {iscraColor ? (
                    <BrandLogo
                        logo={logos?.iscra}
                        color={iscraColor}
                        height={14}
                    />
                ) : null}
                {company ? <Text style={styles.company}>{company}</Text> : null}
            </View>
            {withDate ? (
                <Text style={styles.date}>{model.meta.date}</Text>
            ) : null}
        </View>
    );
};
