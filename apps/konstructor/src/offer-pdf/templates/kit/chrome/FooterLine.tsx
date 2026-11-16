import type { FC } from 'react';
import { View } from '@react-pdf/renderer';
import { GradientLine } from '../decor/GradientLine';
import { contentWidth, type OfferPdfTheme } from '../theme/offer-pdf-theme';
import { footerGradientHeight, footerLineKind } from './footer-line.util';
import { managerFooterStyles } from './manager-footer.styles';

export interface FooterLineProps {
    theme: OfferPdfTheme;
}

/**
 * Черта над менеджером. Рамку рисует сам подвал; градиентная черта стоит в
 * потоке под отступом подвала, линия акцента — поверх отступа, у его верха.
 */
export const FooterLine: FC<FooterLineProps> = ({ theme }) => {
    const kind = footerLineKind(theme);
    if (kind === 'border') return null;
    if (kind === 'accent') {
        return <View style={managerFooterStyles(theme).line} />;
    }
    return (
        <GradientLine
            id={`${theme.code}-footer`}
            width={contentWidth(theme)}
            height={footerGradientHeight(theme)}
            colors={theme.colors.gradient}
        />
    );
};
