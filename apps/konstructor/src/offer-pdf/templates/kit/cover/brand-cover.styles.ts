import { StyleSheet, type Styles } from '@react-pdf/renderer';
import type { PdfStyle } from '../../shared/style.util';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { themedStyles } from '../theme/themed-styles';

/** Поля титульника */
export const COVER_MARGIN = 54;

/** Высота логотипа Гаранта на титульнике */
export const COVER_LOGO_HEIGHT = 28;

/** Расстановка титульника: стиль на каждый блок BrandCover */
export type BrandCoverStyles = {
    /** Логотип и наша компания */
    top: PdfStyle;
    company: PdfStyle;
    /** «Коммерческое предложение · дата», комплект и поставка */
    main: PdfStyle;
    kicker: PdfStyle;
    product: PdfStyle;
    supply: PdfStyle;
    /** «Подготовлено для» и «Подготовил» */
    bottom: PdfStyle;
    person: PdfStyle;
    label: PdfStyle;
    value: PdfStyle;
    detail: PdfStyle;
};

/**
 * Общая расстановка: логотип с компанией слева сверху, заголовок слева,
 * люди внизу в ряд. Высоту и ширину заголовка (main) задаёт стиль: они
 * зависят от его фона.
 */
const baseCoverStyles = ({
    colors,
    sizes,
    fonts,
}: OfferPdfTheme): BrandCoverStyles => ({
    top: {
        position: 'absolute',
        top: COVER_MARGIN,
        left: COVER_MARGIN,
        width: 320,
    },
    company: { marginTop: 10, fontSize: sizes.sm, color: colors.text },
    main: { position: 'absolute', left: COVER_MARGIN },
    kicker: {
        fontSize: sizes.xs,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: colors.accent,
        marginBottom: 12,
    },
    product: {
        fontFamily: fonts.heading,
        fontSize: sizes.h1,
        fontWeight: 'bold',
        lineHeight: 1.12,
        color: colors.accentStrong ?? colors.text,
    },
    supply: {
        marginTop: 12,
        fontSize: sizes.lg + 1,
        lineHeight: 1.35,
        color: colors.text,
    },
    bottom: {
        position: 'absolute',
        left: COVER_MARGIN,
        right: COVER_MARGIN,
        bottom: COVER_MARGIN,
        flexDirection: 'row',
    },
    person: { width: '50%', paddingRight: 14 },
    label: {
        fontSize: sizes.xs,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: colors.accent,
        marginBottom: 3,
    },
    value: {
        fontFamily: fonts.heading,
        fontSize: sizes.lg,
        fontWeight: 'bold',
        color: colors.text,
    },
    detail: { marginTop: 2, fontSize: sizes.sm, color: colors.muted },
});

/**
 * Стили титульника стиля: общая расстановка и правки поверх неё, один раз
 * на тему. Блок из правок заменяет общий целиком; чтобы поменять в нём
 * пару свойств, стиль разворачивает общий: `main: { ...base.main, top: 130 }`.
 * Сверх блоков BrandCover стиль может добавить свои (фон, черта).
 */
export const brandCoverStyles = <Extra extends Styles = Record<never, never>>(
    own: (
        base: BrandCoverStyles,
        theme: OfferPdfTheme,
    ) => Partial<BrandCoverStyles> & Extra,
): ((theme: OfferPdfTheme) => BrandCoverStyles & Extra) =>
    themedStyles(theme => {
        const base = baseCoverStyles(theme);
        return StyleSheet.create({ ...base, ...own(base, theme) });
    });
