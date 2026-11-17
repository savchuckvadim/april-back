import { fakeMp4 } from '../../media/__tests__/support/media-fixtures';
import {
    createLibraryHarness,
    realImage,
    type LibraryHarness,
} from './support/library-fixtures';

/**
 * Окно при замене файла: строка базы ни в какой момент не указывает на
 * удалённый файл. Новый файл ложится рядом с прежним, затем правится
 * строка, и только потом убирается прежний; сорванная правка строки
 * оставляет прежний файл на месте и убирает новый.
 */
describe('SiteMediaLibraryFilesService: сорванная правка строки', () => {
    let h: LibraryHarness;
    let png: Buffer;
    let jpg: Buffer;

    beforeAll(async () => {
        png = await realImage(40, 30);
        jpg = await realImage(80, 60, 'jpeg', '#00aa55');
    });

    beforeEach(() => {
        h = createLibraryHarness();
    });

    afterEach(() => h.temp.cleanup());

    const failNextUpdate = () =>
        jest
            .spyOn(h.repository, 'update')
            .mockRejectedValueOnce(new Error('база недоступна'));

    it('замена картинки: прежний файл на месте, новый убран, строка прежняя', async () => {
        const before = await h.library.upload({ file: { buffer: png } }, null);
        failNextUpdate();
        await expect(
            h.files.replaceFile(before.id, { buffer: jpg }, {}),
        ).rejects.toThrow('база недоступна');
        expect(h.filesOnDisk()).toEqual([before.fileName]);
        expect(h.repository.rows.get(before.id)).toMatchObject({
            fileName: before.fileName,
            width: 40,
            height: 30,
        });
    });

    it('замена тем же файлом (то же имя): сбой не удаляет действующий файл', async () => {
        const before = await h.library.upload({ file: { buffer: png } }, null);
        failNextUpdate();
        await expect(
            h.files.replaceFile(before.id, { buffer: png }, {}),
        ).rejects.toThrow('база недоступна');
        expect(h.filesOnDisk()).toEqual([before.fileName]);
    });

    it('замена ролика: прежний ролик и постер на месте', async () => {
        const before = await h.library.upload(
            {
                file: { buffer: fakeMp4('a') },
                poster: { buffer: await realImage(16, 9, 'jpeg') },
            },
            null,
        );
        failNextUpdate();
        await expect(
            h.files.replaceFile(before.id, { buffer: fakeMp4('b') }, {}),
        ).rejects.toThrow('база недоступна');
        expect(h.filesOnDisk()).toEqual(
            [before.fileName, before.posterFileName].sort(),
        );
    });

    it('новый постер: прежний постер на месте', async () => {
        const before = await h.library.upload(
            {
                file: { buffer: fakeMp4() },
                poster: { buffer: await realImage(16, 9, 'jpeg') },
            },
            null,
        );
        failNextUpdate();
        await expect(
            h.files.setPoster(before.id, {
                buffer: await realImage(32, 18, 'png'),
            }),
        ).rejects.toThrow('база недоступна');
        expect(h.filesOnDisk()).toEqual(
            [before.fileName, before.posterFileName].sort(),
        );
        expect(h.repository.rows.get(before.id)?.posterFileName).toBe(
            before.posterFileName,
        );
    });

    it('новый тёмный вариант: прежний на месте', async () => {
        const before = await h.library.upload(
            { file: { buffer: png }, dark: { buffer: jpg } },
            null,
        );
        failNextUpdate();
        await expect(
            h.files.setDark(before.id, {
                buffer: await realImage(40, 30, 'webp', '#000000'),
            }),
        ).rejects.toThrow('база недоступна');
        expect(h.filesOnDisk()).toEqual(
            [before.fileName, before.darkFileName].sort(),
        );
    });

    it('снятие постера: строка не поправилась — файл постера на месте', async () => {
        const before = await h.library.upload(
            {
                file: { buffer: fakeMp4() },
                poster: { buffer: await realImage(16, 9, 'jpeg') },
            },
            null,
        );
        failNextUpdate();
        await expect(h.files.removePoster(before.id)).rejects.toThrow(
            'база недоступна',
        );
        expect(h.filesOnDisk()).toContain(before.posterFileName);
    });

    it('удачная замена: строка с новым файлом, прежний убран после правки', async () => {
        const before = await h.library.upload({ file: { buffer: png } }, null);
        const update = jest.spyOn(h.repository, 'update');
        const filesAtUpdate: string[][] = [];
        update.mockImplementationOnce((id, patch) => {
            filesAtUpdate.push(h.filesOnDisk());
            update.mockRestore();
            return h.repository.update(id, patch);
        });
        const after = await h.files.replaceFile(before.id, { buffer: jpg }, {});
        expect(filesAtUpdate[0]).toEqual(
            [before.fileName, after.fileName].sort(),
        );
        expect(h.filesOnDisk()).toEqual([after.fileName]);
    });
});
