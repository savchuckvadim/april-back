/** Меняет расширение файла: `offer-1.docx` + `.pdf` → `offer-1.pdf`. */
export function replaceExtension(filePath: string, newExt: string): string {
    return filePath.replace(/\.[^/.]+$/, newExt);
}
