import { StyleSheet } from '@react-pdf/renderer';
import { strongAccent } from '../../kit/theme/theme-colors.util';
import { themedStyles } from '../../kit/theme/themed-styles';

/**
 * Страница о системе «Перламутра». Лист Canva задаёт расстановку: шапка
 * на 37 % высоты (313 pt) и чистое поле под ней. Заголовок с вступлением
 * стоят в шапке и прижаты к её низу, пункты начинаются уже на чистом поле.
 * Высота блока шапки подобрана под верхнее поле листа (около 100 pt):
 * 100 + 190 = 290 pt, до низа шапки остаётся запас на разные шапки листа.
 */
export const pearlPromoStyles = themedStyles(theme => {
    const { colors, sizes, fonts } = theme;
    return StyleSheet.create({
        hero: { minHeight: 190, justifyContent: 'flex-end', paddingBottom: 18 },
        kicker: {
            fontSize: sizes.xs,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: strongAccent(theme),
            marginBottom: 8,
        },
        title: {
            fontFamily: fonts.heading,
            fontSize: 26,
            fontWeight: fonts.headingWeight ?? 'bold',
            lineHeight: 1.12,
            letterSpacing: -0.3,
            color: strongAccent(theme),
            maxWidth: 420,
        },
        lead: {
            marginTop: 10,
            fontSize: sizes.lg,
            color: colors.text,
            maxWidth: 440,
        },
        items: {
            marginTop: 40,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
        },
        item: { width: '47%', flexDirection: 'row', marginBottom: 22 },
        note: { marginTop: 6, fontSize: sizes.base, color: colors.muted },
    });
});
