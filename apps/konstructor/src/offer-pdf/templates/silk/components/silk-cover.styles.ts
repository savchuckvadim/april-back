import {
    brandCoverStyles,
    COVER_MARGIN,
} from '../../kit/cover/brand-cover.styles';

/**
 * Расстановка титульника «Шёлка». Волны идут из правого верхнего угла и по
 * диагонали слева-посередине вправо-вниз: свободны левый верх, правая
 * середина и левый низ.
 */
export const silkCoverStyles = brandCoverStyles(
    (base, { colors, sizes, fonts }) => ({
        top: { ...base.top, width: 260 },
        // правее левой волны, шире — длинное первое слово комплекта не переносится
        main: { ...base.main, top: 290, left: 236, width: 306 },
        product: { ...base.product, fontWeight: 400 },
        supply: { ...base.supply, fontSize: sizes.lg },
        // люди — столбиком в левом нижнем углу
        bottom: {
            position: 'absolute',
            left: COVER_MARGIN,
            bottom: COVER_MARGIN,
            width: 250,
        },
        person: { marginTop: 12 },
        value: {
            fontFamily: fonts.heading,
            fontSize: sizes.lg,
            color: colors.text,
        },
    }),
);
