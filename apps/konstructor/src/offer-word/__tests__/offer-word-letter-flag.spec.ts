import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

/**
 * Флаг письма доходит до Word-шаблона меткой WithLetter. Проверяем на
 * настоящем docxtemplater с теми же настройками, что у генерации КП, что
 * условный блок {#WithLetter}…{/WithLetter} скрывается при false и остаётся
 * при true, а шаблон без блока печатает письмо при любом значении: текст
 * письма и подпись лежат в самом файле шаблона.
 */
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const paragraph = (text: string): string =>
    `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** Минимальный .docx из абзацев: хватает docxtemplater */
const buildTemplate = (paragraphs: string[]): Buffer => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.file('_rels/.rels', ROOT_RELS);
    zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(paragraph).join('')}</w:body></w:document>`,
    );
    return zip.generate({ type: 'nodebuffer' });
};

const renderText = (
    template: Buffer,
    data: Record<string, unknown>,
): string => {
    const doc = new Docxtemplater(new PizZip(template), {
        paragraphLoop: true,
        linebreaks: true,
    });
    doc.render(data);
    return doc.getFullText();
};

describe('Word-шаблон: условный блок письма {#WithLetter}', () => {
    const conditional = buildTemplate([
        '{MyCompanyName}',
        '{#WithLetter}',
        'Уважаемые коллеги! Направляем коммерческое предложение.',
        'Директор ________ А. В. Кузнецов',
        '{/WithLetter}',
        'Стоимость',
    ]);
    const plain = buildTemplate([
        '{MyCompanyName}',
        'Уважаемые коллеги! Направляем коммерческое предложение.',
        'Директор ________ А. В. Кузнецов',
        'Стоимость',
    ]);

    it('WithLetter = true: письмо и подпись на месте', () => {
        const text = renderText(conditional, {
            MyCompanyName: 'ООО «Гарант»',
            WithLetter: true,
        });
        expect(text).toContain('Уважаемые коллеги!');
        expect(text).toContain('А. В. Кузнецов');
        expect(text).toContain('Стоимость');
    });

    it('WithLetter = false: блок письма и подписи исчезает, остальное остаётся', () => {
        const text = renderText(conditional, {
            MyCompanyName: 'ООО «Гарант»',
            WithLetter: false,
        });
        expect(text).not.toContain('Уважаемые коллеги!');
        expect(text).not.toContain('А. В. Кузнецов');
        expect(text).toContain('ООО «Гарант»');
        expect(text).toContain('Стоимость');
    });

    it('шаблон без условного блока печатает письмо при любом значении флага', () => {
        for (const WithLetter of [true, false]) {
            const text = renderText(plain, {
                MyCompanyName: 'ООО «Гарант»',
                WithLetter,
            });
            expect(text).toContain('Уважаемые коллеги!');
            expect(text).toContain('А. В. Кузнецов');
        }
    });
});
