import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Пункт страницы о сервисе: 3D-иконка слева, текст справа */
export const iskraPromoStyles = themedStyles(() =>
    StyleSheet.create({
        item: { marginTop: 16, flexDirection: 'row' },
        icon: { width: 46, height: 46, objectFit: 'contain', marginRight: 14 },
    }),
);
