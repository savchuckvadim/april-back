import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';

export const stampsStyles = themedStyles(({ colors, sizes }) =>
    StyleSheet.create({
        stamps: {
            marginTop: 18,
            flexDirection: 'row',
            alignItems: 'center',
        },
        side: { width: '34%', justifyContent: 'center' },
        sideRight: {
            width: '34%',
            justifyContent: 'center',
            alignItems: 'flex-end',
        },
        middle: {
            width: '32%',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
        },
        // Без картинок блок низкий — иначе он не влезал под итогом и
        // уезжал один на новую страницу.
        middleLine: { height: 36 },
        middleImages: { height: 96 },
        stamp: {
            position: 'absolute',
            top: 0,
            width: 92,
            height: 92,
            objectFit: 'contain',
        },
        signature: { width: 80, height: 40, objectFit: 'contain' },
        signLine: { fontSize: sizes.base, color: colors.muted },
        text: { fontSize: sizes.base, textAlign: 'right' },
    }),
);
