import { brandCoverStyles } from '../../kit/cover/brand-cover.styles';
import { A4 } from '../../kit/theme/offer-pdf-theme';

/** Поля титульника */
const MARGIN = 52;
/** Колонка текста: правее — грани */
const TEXT_WIDTH = 360;

/** Логотип на тёмном листе чуть крупнее общего */
export const FACET_COVER_LOGO_HEIGHT = 30;

/**
 * Расстановка титульника «Грани»: тёмный лист, текст цветом титульника,
 * подписи — светлым оттенком гаммы; люди — столбиком справа внизу.
 */
export const facetCoverStyles = brandCoverStyles((base, { colors, sizes }) => {
    const text = colors.coverText ?? '#FFFFFF';
    const caption = colors.accentSoft ?? text;
    return {
        paper: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: A4.width,
            height: A4.height,
            backgroundColor: colors.coverPaper ?? colors.accent,
        },
        shapes: { position: 'absolute', top: 0, left: 0 },
        top: {
            position: 'absolute',
            top: MARGIN,
            left: MARGIN,
            width: TEXT_WIDTH,
        },
        company: { ...base.company, color: text, opacity: 0.85 },
        main: {
            position: 'absolute',
            top: 250,
            left: MARGIN,
            width: TEXT_WIDTH,
        },
        kicker: { ...base.kicker, color: caption, marginBottom: 14 },
        product: { ...base.product, color: text },
        bar: {
            width: 56,
            height: 4,
            backgroundColor: colors.accent,
            marginTop: 18,
        },
        supply: { ...base.supply, marginTop: 14, color: text, opacity: 0.85 },
        // правее нижних граней: они доходят до 280 pt по низу листа
        bottom: {
            position: 'absolute',
            left: 300,
            right: MARGIN,
            bottom: MARGIN + 6,
        },
        person: { marginTop: 14 },
        label: { ...base.label, color: caption },
        value: { ...base.value, fontSize: sizes.lg + 1, color: text },
        detail: { ...base.detail, color: text, opacity: 0.8 },
    };
});
