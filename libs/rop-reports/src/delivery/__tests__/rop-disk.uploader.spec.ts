import { RopDiskUploader } from '../rop-disk.uploader';
import {
    ROP_DISK_TARGET_KIND,
    ROP_REPORTS_FOLDER,
} from '../rop-delivery.types';
import { makeDeliveryBitrix } from './fixtures/bitrix-delivery.fixture';

const OWNER = 447;
const FILE = {
    name: 'Итоги недели 16.11-22.11.xlsx',
    content: Buffer.from('xlsx'),
};
const OWNER_FOLDER = {
    kind: ROP_DISK_TARGET_KIND.ownerFolder,
    name: ROP_REPORTS_FOLDER,
} as const;

describe('файлы отчётов РОПу на Диске', () => {
    it('в папку «Отчёты РОПу» личного Диска владельца вебхука', async () => {
        const { bitrix, service } = makeDeliveryBitrix();
        const warnings: string[] = [];

        const fileId = await new RopDiskUploader(service, OWNER_FOLDER).upload(
            FILE,
            OWNER,
            warnings,
        );

        expect(fileId).toBe(9035);
        expect(bitrix.disk.storage.getlist).toHaveBeenCalledWith({
            ENTITY_TYPE: 'user',
            ENTITY_ID: OWNER,
        });
        expect(bitrix.disk.storage.getchildren).toHaveBeenCalledWith({
            id: 1357,
            filter: { NAME: 'Отчёты РОПу', TYPE: 'folder' },
        });
        expect(bitrix.disk.folder.uploadfile).toHaveBeenCalledWith({
            id: 2468,
            data: { NAME: FILE.name },
            fileContent: [FILE.name, Buffer.from('xlsx').toString('base64')],
            generateUniqueName: true,
        });
        expect(warnings).toEqual([]);
    });

    it('папки нет — создаётся один раз на прогон', async () => {
        const { bitrix, service } = makeDeliveryBitrix();
        bitrix.disk.storage.getchildren.mockResolvedValue({ result: [] });
        const uploader = new RopDiskUploader(service, OWNER_FOLDER);

        await uploader.upload(FILE, OWNER, []);
        await uploader.upload(FILE, OWNER, []);

        expect(bitrix.disk.storage.getlist).toHaveBeenCalledTimes(1);
        expect(bitrix.disk.storage.addfolder).toHaveBeenCalledTimes(1);
        expect(bitrix.disk.storage.addfolder).toHaveBeenCalledWith({
            id: 1357,
            data: { NAME: 'Отчёты РОПу' },
        });
        expect(
            bitrix.disk.folder.uploadfile.mock.calls.map(([req]) => req.id),
        ).toEqual([2469, 2469]);
    });

    it('папку не создать — файл в корень Диска, с предупреждением', async () => {
        const { bitrix, service } = makeDeliveryBitrix();
        bitrix.disk.storage.getchildren.mockRejectedValue(new Error('denied'));
        const warnings: string[] = [];

        const fileId = await new RopDiskUploader(service, OWNER_FOLDER).upload(
            FILE,
            OWNER,
            warnings,
        );

        expect(fileId).toBe(9034);
        expect(bitrix.disk.storage.uploadfile).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1357 }),
        );
        expect(warnings).toEqual([
            'папка «Отчёты РОПу» на Диске не создана: denied — файлы легли в корень Диска',
        ]);
    });

    it('личный Диск не найден — null, ищется один раз', async () => {
        const { bitrix, service } = makeDeliveryBitrix();
        bitrix.disk.storage.getlist.mockResolvedValue({ result: [] });
        const uploader = new RopDiskUploader(service, OWNER_FOLDER);
        const warnings: string[] = [];

        expect(await uploader.upload(FILE, OWNER, warnings)).toBeNull();
        expect(await uploader.upload(FILE, OWNER, warnings)).toBeNull();

        expect(bitrix.disk.storage.getlist).toHaveBeenCalledTimes(1);
        expect(warnings).toEqual([
            `личный Диск сотрудника ${OWNER} не найден — файлы отчёта не загружены`,
        ]);
    });

    it('владелец вебхука неизвестен — Диск не трогаем', async () => {
        const { bitrix, service } = makeDeliveryBitrix();
        const warnings: string[] = [];

        expect(
            await new RopDiskUploader(service, OWNER_FOLDER).upload(
                FILE,
                null,
                warnings,
            ),
        ).toBeNull();
        expect(bitrix.disk.storage.getlist).not.toHaveBeenCalled();
        expect(warnings).toEqual([
            'владелец вебхука не определён — файлы отчёта не загружены на Диск',
        ]);
    });

    it('загрузка упала или id не вернулся — null и предупреждение', async () => {
        const { bitrix, service } = makeDeliveryBitrix();
        bitrix.disk.folder.uploadfile.mockRejectedValueOnce(
            new Error('insufficient_scope'),
        );
        bitrix.disk.folder.uploadfile.mockResolvedValueOnce({ result: {} });
        const uploader = new RopDiskUploader(service, OWNER_FOLDER);
        const warnings: string[] = [];

        expect(await uploader.upload(FILE, OWNER, warnings)).toBeNull();
        expect(await uploader.upload(FILE, OWNER, warnings)).toBeNull();
        expect(warnings).toEqual([
            `файл «${FILE.name}» не загружен на Диск: insufficient_scope`,
            `файл «${FILE.name}» не загружен: Битрикс не вернул id файла`,
        ]);
    });

    it('готовая папка по id — сразу в неё, без поиска хранилища', async () => {
        const { bitrix, service } = makeDeliveryBitrix();

        const fileId = await new RopDiskUploader(service, {
            kind: ROP_DISK_TARGET_KIND.folder,
            folderId: 555,
        }).upload(FILE, null, []);

        expect(fileId).toBe(9035);
        expect(bitrix.disk.folder.uploadfile).toHaveBeenCalledWith(
            expect.objectContaining({ id: 555 }),
        );
        expect(bitrix.disk.storage.getlist).not.toHaveBeenCalled();
    });
});
