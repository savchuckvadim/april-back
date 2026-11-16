import type { FC } from 'react';
import { ManagerFooter } from '../../kit/chrome/ManagerFooter';
import { GradientLine } from '../../kit/decor/GradientLine';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { contentWidth } from '../../kit/theme/offer-pdf-theme';

/** Подвал «Искры»: черта оранжевый → розовый и менеджер */
export const IskraFooter: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <ManagerFooter
        model={model}
        theme={theme}
        line={
            theme.colors.gradient ? (
                <GradientLine
                    id="iskra-footer"
                    width={contentWidth(theme)}
                    height={2}
                    colors={theme.colors.gradient}
                />
            ) : undefined
        }
    />
);
