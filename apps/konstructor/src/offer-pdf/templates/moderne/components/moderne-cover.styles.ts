import { brandCoverStyles } from '../../kit/cover/brand-cover.styles';

/**
 * Расстановка титульника «Модерна». Заливка занимает верх и середину
 * листа: текст — в светлой нижней части.
 */
export const moderneCoverStyles = brandCoverStyles(base => ({
    main: { ...base.main, top: 500, width: 440 },
    // под поставкой — черта стиля
    supply: { ...base.supply, marginTop: 10, marginBottom: 14 },
}));
