import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { createTempStorage, TempStorage } from './support/image-fixtures';

describe('файлы картинок поставщика', () => {
    let temp: TempStorage;

    beforeEach(() => {
        temp = createTempStorage();
    });

    afterEach(() => temp.cleanup());

    it('путь внутри storage/app: каталог реквизитов, uuid и расширение формата', () => {
        expect(temp.storage.relativePath(15, 'abc-123', 'png')).toBe(
            'konstructor/provider-images/15/abc-123.png',
        );
        expect(temp.storage.relativePath(15, 'abc-123', 'jpg')).toBe(
            'konstructor/provider-images/15/abc-123.jpg',
        );
    });

    it('запись создаёт каталоги и не оставляет временных файлов', async () => {
        const path = temp.storage.relativePath(7, 'f1', 'png');
        await temp.storage.write(path, Buffer.from('содержимое'));

        expect(readFileSync(temp.fullPath(path), 'utf8')).toBe('содержимое');
        expect(readdirSync(dirname(temp.fullPath(path)))).toEqual(['f1.png']);
    });

    it('чтение отдаёт содержимое, а отсутствующий файл — null', async () => {
        const path = temp.storage.relativePath(7, 'f1', 'png');
        await temp.storage.write(path, Buffer.from('abc'));

        expect((await temp.storage.read(path))?.toString()).toBe('abc');
        expect(
            await temp.storage.read('konstructor/provider-images/7/no.png'),
        ).toBeNull();
    });

    it('удаление убирает файл, а отсутствующий файл не считает ошибкой', async () => {
        const path = temp.storage.relativePath(7, 'f1', 'png');
        await temp.storage.write(path, Buffer.from('abc'));

        await temp.storage.remove(path);
        expect(existsSync(temp.fullPath(path))).toBe(false);

        await expect(temp.storage.remove(path)).resolves.toBeUndefined();
    });

    it('путь за пределами storage/app отвергается: чужие файлы не читаются и не удаляются', async () => {
        await expect(temp.storage.read('../secret.txt')).rejects.toThrow(
            'выходит за каталог хранилища',
        );
        await expect(temp.storage.remove('../../secret.txt')).rejects.toThrow(
            'выходит за каталог хранилища',
        );
        await expect(
            temp.storage.write('../escape.png', Buffer.from('x')),
        ).rejects.toThrow('выходит за каталог хранилища');
    });
});
