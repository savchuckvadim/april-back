import { BadRequestException } from '@nestjs/common';
import { SupplyReportTemplateFilesService } from '../services/supply-report-template-files.service';
import { docx, mockFn } from './supply-report-template.fixtures';

describe('SupplyReportTemplateFilesService', () => {
    let saveFile: jest.Mock<Promise<string>, [Buffer, string, string, string]>;
    let deleteFile: jest.Mock<Promise<void>, [string]>;
    let service: SupplyReportTemplateFilesService;

    beforeEach(() => {
        saveFile = mockFn();
        saveFile.mockResolvedValue(
            'konstructor/supply-report-templates/x.docx',
        );

        deleteFile = mockFn();
        deleteFile.mockResolvedValue(undefined);

        service = new SupplyReportTemplateFilesService({
            saveFile,
            deleteFile,
        } as never);
    });

    describe('assertUploadsValid', () => {
        it('requireFile: отсутствие файла — 400', () => {
            expect(() => service.assertUploadsValid({}, true)).toThrow(
                BadRequestException,
            );
        });

        it('не requireFile: отсутствие файла допустимо (обновление без замены)', () => {
            expect(() => service.assertUploadsValid({}, false)).not.toThrow();
        });

        it('валидный .docx проходит', () => {
            expect(() =>
                service.assertUploadsValid({ file: docx() }, true),
            ).not.toThrow();
        });

        it('файл без ZIP-подписи отклоняется', () => {
            const broken = {
                ...docx(),
                buffer: Buffer.from([0x00, 0x01]),
            } as Express.Multer.File;
            expect(() =>
                service.assertUploadsValid({ file: broken }, true),
            ).toThrow(BadRequestException);
        });

        it('битое демо отклоняется даже при валидном основном файле', () => {
            const broken = {
                ...docx('demo.docx'),
                buffer: Buffer.from([0x00]),
            } as Express.Multer.File;
            expect(() =>
                service.assertUploadsValid(
                    { file: docx(), demo: broken },
                    true,
                ),
            ).toThrow(BadRequestException);
        });
    });

    describe('save', () => {
        it('имя в хранилище — UUID с исходным расширением, без кириллицы', async () => {
            await service.save(docx('Отчёт о поставке.DOCX'));

            const [, name] = saveFile.mock.calls[0];
            expect(name).toMatch(/^[0-9a-f-]{36}\.docx$/);
        });

        it('без расширения подставляется .docx', async () => {
            await service.save(docx('template'));
            expect(saveFile.mock.calls[0][1]).toMatch(/\.docx$/);
        });

        it('кладёт файл в подпапку модуля', async () => {
            await service.save(docx());
            expect(saveFile.mock.calls[0][3]).toBe(
                'konstructor/supply-report-templates',
            );
        });
    });

    describe('replace', () => {
        it('сохраняет новый и удаляет предыдущий', async () => {
            const saved = await service.replace(docx(), 'old.docx');

            expect(saved).toBe('konstructor/supply-report-templates/x.docx');
            expect(deleteFile).toHaveBeenCalledWith('old.docx');
        });

        it('без предыдущего пути ничего не удаляет', async () => {
            await service.replace(docx(), null);
            expect(deleteFile).not.toHaveBeenCalled();
        });
    });

    describe('remove', () => {
        it('пустой путь — no-op', async () => {
            await service.remove(null);
            expect(deleteFile).not.toHaveBeenCalled();
        });

        it('ошибка хранилища не пробрасывается: осиротевший файл безвреден', async () => {
            deleteFile.mockRejectedValue(new Error('нет прав'));
            await expect(service.remove('a.docx')).resolves.toBeUndefined();
        });
    });
});
