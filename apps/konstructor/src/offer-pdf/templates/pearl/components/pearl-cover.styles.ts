import { brandCoverStyles } from '../../kit/cover/brand-cover.styles';

/** Расстановка титульника «Перламутра» */
export const pearlCoverStyles = brandCoverStyles((base, { colors, sizes }) => ({
    top: { ...base.top, width: 300 },
    // левее стекла справа: оно занимает верхнюю половину листа от 60 % ширины
    main: { ...base.main, top: 300, width: 310 },
    kicker: { ...base.kicker, marginBottom: 14 },
    product: {
        ...base.product,
        fontWeight: 600,
        lineHeight: 1.1,
        letterSpacing: -0.5,
    },
    supply: { ...base.supply, marginTop: 14 },
    // правее стекла в левом нижнем углу
    bottom: { ...base.bottom, left: 170 },
    value: { fontSize: sizes.lg, fontWeight: 600, color: colors.text },
}));
