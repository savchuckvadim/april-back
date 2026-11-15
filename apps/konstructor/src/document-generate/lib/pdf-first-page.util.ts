import { PDFDocument } from 'pdf-lib';

/** Первая страница PDF отдельным файлом — для превью шаблонов и стилей */
export const pdfFirstPage = async (pdf: Buffer): Promise<Buffer> => {
    const source = await PDFDocument.load(pdf);
    const target = await PDFDocument.create();
    const [page] = await target.copyPages(source, [0]);
    target.addPage(page);
    return Buffer.from(await target.save());
};
