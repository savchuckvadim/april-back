import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { OfferLetter } from '../../kit/letter/OfferLetter';
import { promoStyles } from '../../kit/promo/promo.styles';
import { OfferStamps } from '../../kit/stamps/OfferStamps';
import { MODERNE_PROMO_TITLE } from '../moderne.theme';

/**
 * Страница с письмом, как во вордовском «Модерне»: заголовок, письмо
 * портала (или правленое менеджером) и подпись под ним. В начале документа
 * письмо и подпись тогда не повторяются (promoReplacesLetter).
 */
export const ModernePromo: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <>
        <Text style={promoStyles(theme).title}>{MODERNE_PROMO_TITLE}</Text>
        <OfferLetter model={model} theme={theme} />
        {model.settings.withStamps ? (
            <OfferStamps model={model} theme={theme} />
        ) : null}
    </>
);
