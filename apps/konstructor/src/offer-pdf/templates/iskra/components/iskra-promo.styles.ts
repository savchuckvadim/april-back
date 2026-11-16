import { StyleSheet } from '@react-pdf/renderer';

/** Пункт страницы о сервисе: 3D-иконка слева, текст справа */
export const iskraPromoStyles = StyleSheet.create({
    item: { marginTop: 16, flexDirection: 'row' },
    icon: { width: 46, height: 46, objectFit: 'contain', marginRight: 14 },
});
