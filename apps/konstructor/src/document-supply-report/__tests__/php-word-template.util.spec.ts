import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
    convertPhpWordTemplate,
    openPhpWordBlocks,
    wrapPhpWordRows,
} from '../lib/php-word-template.util';

const run = (text: string) => `<w:r><w:t>${text}</w:t></w:r>`;
const cell = (text: string) => `<w:tc><w:p>${run(text)}</w:p></w:tc>`;

describe('перевод PhpWord-шаблона на docxtemplater', () => {
    it('блок cloneBlock: открывающий тег получает «#», даже если имя в отдельном фрагменте', () => {
        const xml =
            run('{') +
            run('client_rq_block') +
            run('}') +
            run('{client_rq}') +
            run('{/client_rq_block}');
        const out = openPhpWordBlocks(xml);
        expect(out).toContain('<w:t>#client_rq_block</w:t>');
        expect(out).toContain('{/client_rq_block}');
    });

    it('строка таблицы с маркером становится циклом', () => {
        const xml = `<w:tbl><w:tr>${cell('{productNumber}')}${cell('{productSum}')}</w:tr></w:tbl>`;
        const out = wrapPhpWordRows(xml);
        expect(out).toContain('<w:t>{#productRows}{productNumber}</w:t>');
        expect(out).toContain('<w:t>{productSum}{/productRows}</w:t>');
    });

    it('шаблон под docxtemplater не трогаем', () => {
        const xml = `<w:tbl><w:tr>${cell('{#productRows}{productNumber}')}${cell('{/productRows}')}</w:tr></w:tbl>`;
        expect(convertPhpWordTemplate(xml)).toBe(xml);
    });

    it('$ перед полем снимается', () => {
        expect(convertPhpWordTemplate(run('${sale_date}'))).toBe(
            run('{sale_date}'),
        );
    });
});

/**
 * Настоящие шаблоны из Laravel (storage в git не лежит — без файлов тест
 * пропускается): рендер без ошибок, строки товаров и контактов размножены.
 */
const STORAGE = join(process.cwd(), 'storage/app/konstructor/templates/supply');
const TEMPLATES = [
    join(STORAGE, 'sales_report.docx'),
    join(STORAGE, 'april-garant.bitrix24.ru/sales_report.docx'),
];

describe.each(TEMPLATES)('шаблон %s', file => {
    const maybe = existsSync(file) ? it : it.skip;

    maybe('собирается: блок реквизитов, по строке на товар и контакт', () => {
        const zip = new PizZip(readFileSync(file));
        for (const part of zip.file(
            /^word\/(?:document|header\d*|footer\d*)\.xml$/,
        )) {
            zip.file(part.name, convertPhpWordTemplate(part.asText()));
        }
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            nullGetter: () => '',
        });
        doc.render({
            sale_date: '12.11.2026',
            client_rq_block: [{ client_rq: 'ООО Ромашка\nИНН 2600000000' }],
            productRows: [
                {
                    productNumber: 1,
                    complectName: 'Гарант-Офис',
                    productSum: '1000.00',
                },
                {
                    productNumber: 2,
                    complectName: 'Гарант-Юрист',
                    productSum: '2000.00',
                },
            ],
            contacts: [
                { contact_name: 'Иванов Иван', contact_phone: '+7 900' },
                { contact_name: 'Петров Пётр', contact_phone: '+7 901' },
            ],
        });
        const text = (
            doc.getZip().file('word/document.xml')?.asText() ?? ''
        ).replace(/<[^>]+>/g, '');
        expect(text).toContain('Гарант-Офис');
        expect(text).toContain('Гарант-Юрист');
        expect(text).toContain('Иванов Иван');
        expect(text).toContain('Петров Пётр');
        expect(text).toContain('ООО Ромашка');
        expect(text).not.toContain('${');
        expect(text).not.toContain('undefined');
    });
});
