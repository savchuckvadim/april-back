import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Font } from '@react-pdf/renderer';
import { PT_SANS_BOLD_BASE64 } from './fonts/pt-sans-bold.base64';
import { PT_SANS_REGULAR_BASE64 } from './fonts/pt-sans-regular.base64';

/**
 * Шрифты PDF-отчётов: PT Sans (кириллица, лицензия OFL) встроен в бандл
 * как base64, при первом рендере выкладывается во временную папку и
 * регистрируется в react-pdf. Файлов рядом с кодом и шагов копирования
 * в сборке не нужно — любому приложению монорепы достаточно импорта.
 */

export const PDF_FONT_FAMILY = 'PT Sans';

const FONTS_DIR_NAME = 'april-pdf-fonts';

const FONT_FILES = [
    {
        file: 'pt-sans-regular.ttf',
        base64: PT_SANS_REGULAR_BASE64,
        weight: 'normal',
    },
    { file: 'pt-sans-bold.ttf', base64: PT_SANS_BOLD_BASE64, weight: 'bold' },
] as const;

let registered = false;

/** Папка со шрифтами; создаётся и наполняется при первом вызове. */
export function ensurePdfFontsDir(baseDir: string = tmpdir()): string {
    const dir = join(baseDir, FONTS_DIR_NAME);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    for (const font of FONT_FILES) {
        const path = join(dir, font.file);
        if (!existsSync(path)) {
            writeFileSync(path, Buffer.from(font.base64, 'base64'));
        }
    }
    return dir;
}

/** Регистрация семейства в react-pdf; повторный вызов — без действий. */
export function registerPdfFonts(baseDir?: string): void {
    if (registered) return;
    const dir = ensurePdfFontsDir(baseDir);
    Font.register({
        family: PDF_FONT_FAMILY,
        fonts: FONT_FILES.map(font => ({
            src: join(dir, font.file),
            fontWeight: font.weight,
        })),
    });
    // Встроенные переносы react-pdf — по английским правилам, русские
    // слова рвутся где попало. Переносим только по пробелам.
    Font.registerHyphenationCallback(word => [word]);
    registered = true;
}
