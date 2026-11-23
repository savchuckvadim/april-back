import { Font } from '@react-pdf/renderer';

/** Часть шрифта fontkit, нужная прогреву: карта символов и выдача глифа по символу */
interface GlyphSource {
    characterSet: number[];
    glyphForCodePoint(codePoint: number): unknown;
}

/** Встроенные шрифты PDF (Helvetica и другие) карты символов не имеют — их прогревать нечем */
const isGlyphSource = (font: unknown): font is GlyphSource =>
    typeof font === 'object' &&
    font !== null &&
    'characterSet' in font &&
    Array.isArray(font.characterSet) &&
    'glyphForCodePoint' in font &&
    typeof font.glyphForCodePoint === 'function';

/**
 * Закрепляет за каждым глифом шрифта его символ до первого рендера.
 *
 * fontkit кэширует глиф по номеру вместе с символами первого обращения и
 * больше их не меняет. Сборка подмножества шрифта для PDF достаёт составные
 * части глифов без символов: кириллическая «О» во многих шрифтах собрана из
 * латинской «O», и после первого документа без латиницы латинская «O» остаётся
 * в кэше без символа до перезапуска процесса. Раскладка react-pdf считает
 * позиции в строке по символам глифа, поэтому такая буква сбивает счёт и
 * соседние глифы выпадают: «Гарант-Предприятие PRO» печатался как
 * «Гарант-Предприятие O», «test» — как «est».
 *
 * Обход карты символов заполняет кэш правильными парами заранее. Порядок —
 * по возрастанию кода: глиф, общий для двух символов, достаётся младшему
 * (дефис раньше мягкого переноса, пробел раньше неразрывного).
 */
export async function primePdfFontGlyphs(
    families: readonly string[],
): Promise<void> {
    const registry = Font.getRegisteredFonts();
    for (const family of families) {
        for (const source of registry[family]?.sources ?? []) {
            await source.load();
            const font: unknown = source.data;
            if (!isGlyphSource(font)) continue;
            const codePoints = [...font.characterSet].sort((a, b) => a - b);
            for (const codePoint of codePoints) {
                font.glyphForCodePoint(codePoint);
            }
        }
    }
}
