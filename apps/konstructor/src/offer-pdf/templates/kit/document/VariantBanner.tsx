import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { variantBannerStyles } from './variant-banner.styles';

export interface VariantBannerProps {
    /** Название варианта комплекта */
    title: string;
    theme: OfferPdfTheme;
}

/**
 * Название варианта в шапке первого листа документа: когда каждый вариант
 * печатается своим документом и документы склеены в один PDF, видно, где
 * какой вариант. Обычный текст в потоке листа, без свойств разбивки.
 */
export const VariantBanner: FC<VariantBannerProps> = ({ title, theme }) => (
    <Text style={variantBannerStyles(theme).title}>{title}</Text>
);
