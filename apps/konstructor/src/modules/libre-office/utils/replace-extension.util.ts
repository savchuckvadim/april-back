import { basename, join } from 'path';

/** Меняет расширение файла: `offer-1.docx` + `.pdf` → `offer-1.pdf`. */
export function replaceExtension(filePath: string, newExt: string): string {
    return filePath.replace(/\.[^/.]+$/, newExt);
}

/**
 * Куда ляжет PDF. Единая формула для фасада (он ищет попадание в кэше по
 * этому пути) и для конвертеров — чтобы они не могли разойтись.
 */
export function pdfPathFor(inputPath: string, outputFolder: string): string {
    return join(outputFolder, replaceExtension(basename(inputPath), '.pdf'));
}
