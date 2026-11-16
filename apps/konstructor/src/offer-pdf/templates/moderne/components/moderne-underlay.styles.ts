import { StyleSheet } from '@react-pdf/renderer';

/**
 * Угловые пятна листа: розовое — справа сверху под датой шапки, синее —
 * слева снизу, заходит за край листа и бледное: под ним подвал и низ текста.
 */
export const moderneUnderlayStyles = StyleSheet.create({
    top: { position: 'absolute', top: 0, right: 0, width: 230, height: 123 },
    bottom: {
        position: 'absolute',
        left: -30,
        bottom: -30,
        width: 150,
        height: 123,
    },
});

/** Бледность синего пятна внизу */
export const MODERNE_BOTTOM_OPACITY = 0.35;
