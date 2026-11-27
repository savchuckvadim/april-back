import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import { baseStyles } from '../base.styles';
import { HEADING_PRESENCE } from '../document/section.layout';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';

export interface PriceHeadingProps {
    /** Подпись под заголовком: что продаём по договору; пусто — подписи нет */
    caption: string | undefined;
    theme: OfferPdfTheme;
}

/** Заголовок раздела «Стоимость» и подпись под ним */
export const PriceHeading: FC<PriceHeadingProps> = ({ caption, theme }) => {
    const base = baseStyles(theme);
    return (
        <>
            <Text
                style={base.h2}
                wrap={false}
                minPresenceAhead={HEADING_PRESENCE}
            >
                Стоимость
            </Text>
            {caption ? <Text style={base.caption}>{caption}</Text> : null}
        </>
    );
};
