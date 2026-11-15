import type { FC } from 'react';
import { StyleSheet, Text } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { themedStyles } from '../theme/themed-styles';

const pageNumberStyles = themedStyles(({ colors, sizes, page }) =>
    StyleSheet.create({
        /**
         * Номер — отдельным fixed-текстом прямо на странице, в правом углу
         * подвала. Внутри подвала он не печатался: у динамического текста
         * react-pdf гасит строку, если у любого предка задан lineHeight
         * (проверено на мини-рендере 15.11). Высота задана явно: без неё
         * Yoga даёт тексту с render-пропом тысячи пунктов.
         */
        pageNumber: {
            position: 'absolute',
            bottom: page.edge,
            right: page.paddingHorizontal,
            width: 60,
            height: Math.ceil(sizes.xs * 1.5),
            fontSize: sizes.xs,
            color: colors.muted,
            textAlign: 'right',
        },
    }),
);

export interface PageNumberProps {
    theme: OfferPdfTheme;
}

/** «3 / 12» в правом нижнем углу каждой страницы */
export const PageNumber: FC<PageNumberProps> = ({ theme }) => (
    <Text
        fixed
        style={pageNumberStyles(theme).pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
    />
);
