import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../../templates/kit/theme/themed-styles';

/** Толщина линий банковской шапки: как рамка таблицы цен КП */
const LINE = 0.75;

/** Ширина QR-блока справа от банковской шапки */
export const QR_BOX_WIDTH = 96;
/** Сторона QR-кода */
export const QR_SIZE = 84;

/**
 * Стили счёта по теме: цвета, кегли и шрифты берутся из темы стиля, как у
 * КП. Поля листа свои: у счёта нет шапки и подвала КП, которые занимают
 * поля темы.
 */
export const invoiceStyles = themedStyles(
    ({ colors, sizes, fonts, lineHeight }) =>
        StyleSheet.create({
            page: {
                fontFamily: fonts.body,
                fontSize: sizes.base,
                color: colors.text,
                paddingTop: 36,
                paddingBottom: 36,
                paddingHorizontal: 40,
                ...(colors.paper ? { backgroundColor: colors.paper } : {}),
            },
            // интерлиньяж на обёртке, не на листе: так делают и блоки КП
            content: { fontSize: sizes.base, lineHeight },
            bold: { fontWeight: 'bold' },
            text: { fontSize: sizes.base },
            caption: { fontSize: sizes.xs, color: colors.muted },

            // банковская шапка: рамка нарисована на ячейках (правая и нижняя линии)
            bankRow: { flexDirection: 'row', alignItems: 'flex-start' },
            // ширину таблицы задаёт остаток строки: длинное название получателя
            // переносится и не сжимает QR и столбцы счетов
            bankTable: {
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                borderTopWidth: LINE,
                borderLeftWidth: LINE,
                borderColor: colors.tableBorder,
            },
            band: { flexDirection: 'row' },
            column: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
            cell: {
                borderRightWidth: LINE,
                borderBottomWidth: LINE,
                borderColor: colors.tableBorder,
                paddingVertical: 3,
                paddingHorizontal: 4,
            },
            cellGrow: { flexGrow: 1, flexShrink: 1 },
            half: { width: '50%' },
            bankCell: {
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                justifyContent: 'space-between',
            },
            // столбец счетов одной ширины в обоих рядах: вертикальные линии сходятся
            accounts: { width: '44%', flexShrink: 0 },
            accountRow: { flexDirection: 'row', flexGrow: 1 },
            accountLabel: { width: '24%' },
            accountValue: { flexGrow: 1, flexShrink: 1 },
            qrBox: {
                width: QR_BOX_WIDTH,
                flexShrink: 0,
                marginLeft: 8,
                alignItems: 'center',
            },
            qr: { width: QR_SIZE, height: QR_SIZE, objectFit: 'contain' },
            qrCaption: {
                marginTop: 3,
                fontSize: sizes.xs,
                color: colors.muted,
                textAlign: 'center',
            },

            title: {
                marginTop: 18,
                fontFamily: fonts.heading,
                fontSize: sizes.h1,
                fontWeight: fonts.headingWeight ?? 'bold',
                color: colors.accent,
                textAlign: 'center',
            },
            parties: { marginTop: 10 },
            party: { marginTop: 4, fontSize: sizes.base },

            rowName: { textAlign: 'left' },
            tableBlock: { marginTop: 14 },

            totals: { marginTop: 8, alignItems: 'flex-end' },
            totalLine: { fontSize: sizes.lg, fontWeight: 'bold' },
            totalSub: { fontSize: sizes.sm, textAlign: 'right' },
            totalWords: {
                marginTop: 4,
                fontSize: sizes.base,
                textAlign: 'right',
                fontStyle: 'italic',
            },
        }),
);
