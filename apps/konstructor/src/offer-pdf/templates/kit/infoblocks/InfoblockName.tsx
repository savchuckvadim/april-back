import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import { baseStyles } from '../base.styles';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { infoblocksStyles } from './infoblocks.styles';

export interface InfoblockNameProps {
    name: string;
    theme: OfferPdfTheme;
}

/** Название блока в левой колонке таблицы */
export const InfoblockName: FC<InfoblockNameProps> = ({ name, theme }) => (
    <Text style={[infoblocksStyles(theme).tdText, baseStyles(theme).bold]}>
        {name}
    </Text>
);
