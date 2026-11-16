import type { FC } from 'react';
import { ManagerFooter } from '../../kit/chrome/ManagerFooter';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { contentWidth } from '../../kit/theme/offer-pdf-theme';
import { ModerneLine } from './ModerneLine';

/** Подвал «Модерна»: черта фиолетовый → бирюзовый и менеджер */
export const ModerneFooter: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <ManagerFooter
        model={model}
        theme={theme}
        line={
            <ModerneLine
                theme={theme}
                id="moderne-footer"
                width={contentWidth(theme)}
                height={2}
            />
        }
    />
);
