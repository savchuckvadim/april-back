import { brandCoverStyles } from '../../kit/cover/brand-cover.styles';

/** Расстановка титульника «Ореола» */
export const haloCoverStyles = brandCoverStyles(base => ({
    // выше колец: они занимают середину листа с 35 % высоты
    main: { ...base.main, top: 130, width: 420 },
    // ниже колец и выше коралловой черты у низа листа
    bottom: { ...base.bottom, bottom: 86 },
}));
