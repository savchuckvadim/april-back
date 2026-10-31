import type { Styles } from '@react-pdf/renderer';

export type PdfStyle = Styles[string];

/**
 * Условные стили: `sx(styles.cell, isLast && styles.cellLast)`.
 * react-pdf не принимает false/undefined внутри массива style.
 */
export const sx = (
    ...styles: Array<PdfStyle | false | null | undefined>
): PdfStyle[] => styles.filter((style): style is PdfStyle => Boolean(style));
