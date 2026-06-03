import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Workbook } from 'exceljs';
import { FileLoaderService } from '../infrastructure/file-loader/file-loader.service';

describe('FileLoaderService', () => {
    const service = new FileLoaderService();
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-rag-file-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    describe('isSupported', () => {
        it.each(['.pdf', '.docx', '.xlsx', '.txt', '.md'])(
            'возвращает true для %s',
            ext => {
                expect(service.isSupported(`/tmp/file${ext}`)).toBe(true);
            },
        );

        it.each(['.doc', '.csv', '.zip', '.bin', ''])(
            'возвращает false для %s',
            ext => {
                expect(service.isSupported(`/tmp/file${ext}`)).toBe(false);
            },
        );

        it('нечувствителен к регистру', () => {
            expect(service.isSupported('/tmp/file.PDF')).toBe(true);
            expect(service.isSupported('/tmp/file.Docx')).toBe(true);
        });
    });

    describe('extractText', () => {
        it('читает .txt как UTF-8', async () => {
            const file = path.join(tmpDir, 'sample.txt');
            await fs.writeFile(file, 'Привет, ГАРАНТ');
            await expect(service.extractText(file)).resolves.toBe(
                'Привет, ГАРАНТ',
            );
        });

        it('читает .md как обычный текст', async () => {
            const file = path.join(tmpDir, 'doc.md');
            await fs.writeFile(file, '# Заголовок\nТекст');
            await expect(service.extractText(file)).resolves.toContain(
                'Заголовок',
            );
        });

        it('читает .xlsx, превращая строки в табличный текст', async () => {
            const file = path.join(tmpDir, 'sample.xlsx');
            const workbook = new Workbook();
            const sheet = workbook.addWorksheet('Прайс');
            sheet.addRow(['Продукт', 'Цена']);
            sheet.addRow(['ГАРАНТ Pro', 12000]);
            await workbook.xlsx.writeFile(file);

            const text = await service.extractText(file);
            expect(text).toContain('Лист: Прайс');
            expect(text).toContain('Продукт');
            expect(text).toContain('ГАРАНТ Pro');
            expect(text).toContain('12000');
        });

        it('бросает понятную ошибку для неподдерживаемого типа', async () => {
            const file = path.join(tmpDir, 'sample.zip');
            await fs.writeFile(file, '');
            await expect(service.extractText(file)).rejects.toThrow(
                /Неподдерживаемый тип файла/,
            );
        });
    });
});
