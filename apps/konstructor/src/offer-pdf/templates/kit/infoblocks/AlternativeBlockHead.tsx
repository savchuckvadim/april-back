import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import { baseStyles } from '../base.styles';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { ALTERNATIVE_BLOCK_TITLE } from './alternative-sets.util';
import { infoblocksStyles } from './infoblocks.styles';

export interface AlternativeBlockHeadProps {
    theme: OfferPdfTheme;
}

/**
 * Общий заголовок блока наполнения наборов для сравнения: стиль заголовка
 * раздела, отступ сверху отделяет блок от наполнения общего набора. Держится
 * вместе с плашкой первого набора — связку собирает HeadWithFirst.
 */
export const AlternativeBlockHead: FC<AlternativeBlockHeadProps> = ({
    theme,
}) => (
    <Text
        style={[
            baseStyles(theme).h2,
            infoblocksStyles(theme).alternativeBlockTitle,
        ]}
    >
        {ALTERNATIVE_BLOCK_TITLE}
    </Text>
);
