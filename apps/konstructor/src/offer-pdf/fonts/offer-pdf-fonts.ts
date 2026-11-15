import { Font } from '@react-pdf/renderer';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Семейства шрифтов PDF-КП. Все — статические TTF с полной кириллицей под
 * OFL (лицензии лежат рядом: files/OFL-*.txt). Variable-шрифты react-pdf
 * не понимает: каждое начертание — свой файл.
 */
export const OFFER_PDF_FONTS = {
    ptSans: 'PT Sans',
    manrope: 'Manrope',
    montserrat: 'Montserrat',
} as const;

/** Шрифт по умолчанию — классика */
export const OFFER_PDF_FONT_FAMILY = OFFER_PDF_FONTS.ptSans;

interface FontFace {
    file: string;
    fontWeight?: number;
    fontStyle?: 'italic';
}

/**
 * Курсива у Manrope и Montserrat нет — курсив регистрируется прямым
 * начертанием: текст с fontStyle 'italic' (фраза об акции) печатается
 * прямо, а не роняет рендер «шрифт не найден».
 */
const FAMILIES: Record<string, readonly FontFace[]> = {
    [OFFER_PDF_FONTS.ptSans]: [
        { file: 'PT_Sans-Web-Regular.ttf', fontWeight: 400 },
        { file: 'PT_Sans-Web-Bold.ttf', fontWeight: 700 },
        {
            file: 'PT_Sans-Web-Italic.ttf',
            fontWeight: 400,
            fontStyle: 'italic',
        },
        {
            file: 'PT_Sans-Web-BoldItalic.ttf',
            fontWeight: 700,
            fontStyle: 'italic',
        },
    ],
    [OFFER_PDF_FONTS.manrope]: [
        { file: 'Manrope-Light.ttf', fontWeight: 300 },
        { file: 'Manrope-Regular.ttf', fontWeight: 400 },
        { file: 'Manrope-SemiBold.ttf', fontWeight: 600 },
        { file: 'Manrope-Bold.ttf', fontWeight: 700 },
        { file: 'Manrope-Regular.ttf', fontWeight: 400, fontStyle: 'italic' },
        { file: 'Manrope-Bold.ttf', fontWeight: 700, fontStyle: 'italic' },
    ],
    [OFFER_PDF_FONTS.montserrat]: [
        { file: 'Montserrat-Regular.ttf', fontWeight: 400 },
        { file: 'Montserrat-Bold.ttf', fontWeight: 700 },
        { file: 'Montserrat-Black.ttf', fontWeight: 900 },
        {
            file: 'Montserrat-Regular.ttf',
            fontWeight: 400,
            fontStyle: 'italic',
        },
        { file: 'Montserrat-Bold.ttf', fontWeight: 700, fontStyle: 'italic' },
    ],
};

/** Файл, по которому ищется каталог шрифтов */
const PROBE_FILE = 'PT_Sans-Web-Regular.ttf';

/**
 * Где лежат ttf. Из исходников (ts-node, jest) — рядом, в `files/`; после
 * `nest build` (webpack) `__dirname` — это каталог бандла, а файлы туда
 * копирует правило assets из nest-cli.json с сохранением пути от sourceRoot.
 */
export const resolveOfferPdfFontsDir = (
    baseDir: string = __dirname,
): string => {
    const candidates = [
        join(baseDir, 'files'),
        join(baseDir, 'offer-pdf', 'fonts', 'files'),
    ];
    const found = candidates.find(dir => existsSync(join(dir, PROBE_FILE)));
    if (!found) {
        throw new Error(
            `Шрифты для PDF-КП не найдены, искали: ${candidates.join('; ')}`,
        );
    }
    return found;
};

let registered = false;

/** Регистрация один раз на процесс: Font.register — глобальный реестр react-pdf. */
export const registerOfferPdfFonts = (): void => {
    if (registered) return;
    const dir = resolveOfferPdfFontsDir();
    for (const [family, faces] of Object.entries(FAMILIES)) {
        Font.register({
            family,
            fonts: faces.map(face => ({
                src: join(dir, face.file),
                fontWeight: face.fontWeight,
                fontStyle: face.fontStyle,
            })),
        });
    }
    // Встроенные переносы react-pdf — по английским правилам, русские слова
    // рвутся где попало. Переносим только по пробелам.
    Font.registerHyphenationCallback(word => [word]);
    registered = true;
};
