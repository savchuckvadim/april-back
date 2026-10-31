import { Font } from '@react-pdf/renderer';
import { existsSync } from 'fs';
import { join } from 'path';

/** PT Sans (OFL, см. files/OFL.txt) — статические TTF с полной кириллицей. */
export const OFFER_PDF_FONT_FAMILY = 'PT Sans';

const FONT_FILES = {
    regular: 'PT_Sans-Web-Regular.ttf',
    bold: 'PT_Sans-Web-Bold.ttf',
    italic: 'PT_Sans-Web-Italic.ttf',
    boldItalic: 'PT_Sans-Web-BoldItalic.ttf',
} as const;

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
    const found = candidates.find(dir =>
        existsSync(join(dir, FONT_FILES.regular)),
    );
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
    Font.register({
        family: OFFER_PDF_FONT_FAMILY,
        fonts: [
            { src: join(dir, FONT_FILES.regular), fontWeight: 'normal' },
            { src: join(dir, FONT_FILES.bold), fontWeight: 'bold' },
            { src: join(dir, FONT_FILES.italic), fontStyle: 'italic' },
            {
                src: join(dir, FONT_FILES.boldItalic),
                fontWeight: 'bold',
                fontStyle: 'italic',
            },
        ],
    });
    // Встроенные переносы react-pdf — по английским правилам, русские слова
    // рвутся где попало. Переносим только по пробелам.
    Font.registerHyphenationCallback(word => [word]);
    registered = true;
};
