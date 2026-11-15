import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Высота «таблетки» и диаметр кружка со стрелкой — в одну линию */
export const MONO_CHIP = 20;

/** Вкладка у правого края: в поле листа, под текст не заходит */
export const MONO_TAB = { width: 22, height: 170, top: 96 } as const;

/** Общие элементы «Монохрома»: таблетка, вкладка */
export const monoStyles = themedStyles(({ colors, sizes }) =>
    StyleSheet.create({
        pill: {
            height: MONO_CHIP,
            paddingHorizontal: 10,
            borderWidth: 0.75,
            borderColor: colors.text,
            borderRadius: MONO_CHIP / 2,
            justifyContent: 'center',
        },
        pillText: {
            fontSize: sizes.xs,
            lineHeight: 1,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.text,
        },
        tab: {
            position: 'absolute',
            right: 0,
            top: MONO_TAB.top,
            width: MONO_TAB.width,
            height: MONO_TAB.height,
            backgroundColor: colors.text,
            borderTopLeftRadius: 6,
            borderBottomLeftRadius: 6,
        },
        /**
         * Подпись вкладки: горизонтальный блок размером с вкладку «на боку»,
         * поставленный центром в её центр и повёрнутый на 90°. У react-pdf
         * ось y листа смотрит вниз: -90deg — по часовой, подпись читается
         * сверху вниз.
         */
        tabLabel: {
            position: 'absolute',
            width: MONO_TAB.height,
            height: MONO_TAB.width,
            left: (MONO_TAB.width - MONO_TAB.height) / 2,
            top: (MONO_TAB.height - MONO_TAB.width) / 2,
            transform: 'rotate(-90deg)',
            justifyContent: 'center',
        },
        tabText: {
            fontSize: sizes.xs,
            lineHeight: 1,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            textAlign: 'center',
            color: colors.paper ?? '#FFFFFF',
        },
    }),
);
