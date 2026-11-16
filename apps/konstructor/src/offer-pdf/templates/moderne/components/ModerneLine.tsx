import type { FC } from 'react';
import { GradientLine } from '../../kit/decor/GradientLine';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';

export interface ModerneLineProps {
    theme: OfferPdfTheme;
    id: string;
    width: number;
    height?: number;
}

/** Черта «Модерна»: фиолетовый → бирюзовый, как полоска вордовского шаблона */
export const ModerneLine: FC<ModerneLineProps> = ({
    theme,
    id,
    width,
    height = 3,
}) =>
    theme.colors.gradient ? (
        <GradientLine
            id={id}
            width={width}
            height={height}
            colors={theme.colors.gradient}
        />
    ) : null;
