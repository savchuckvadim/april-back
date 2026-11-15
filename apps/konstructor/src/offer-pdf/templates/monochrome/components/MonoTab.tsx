import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { monoStyles } from './mono.styles';

/**
 * Чёрная вкладка у правого края с подписью вертикально — на титульнике и
 * подложкой каждой страницы. Лежит в боковом поле: шапкой не считается и
 * поля под себя не раздвигает (isSideDecoration).
 */
export const MonoTab: FC<OfferPdfChromeProps> = ({ theme }) => {
    const styles = monoStyles(theme);
    return (
        <View fixed style={styles.tab}>
            <View style={styles.tabLabel}>
                <Text style={styles.tabText}>Коммерческое предложение</Text>
            </View>
        </View>
    );
};
