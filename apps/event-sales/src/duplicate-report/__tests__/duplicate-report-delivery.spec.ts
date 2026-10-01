import { ETimeZone } from '@lib/shared/lib/date';
import {
    DuplicateDeliveryItem,
    DuplicateReportDelivery,
    DuplicateTaskStorePort,
} from '../services/duplicate-report-delivery';

const DOMAIN = 'garant.bitrix24.ru';
const OWNER = 447;
/** Среда 07.10.2026 18:00 по Москве. */
const DEADLINE = new Date('2026-10-07T18:00:00+03:00');

const item = (userId = 11): DuplicateDeliveryItem => ({
    userId,
    title: 'Дубли сделок: отчёт за неделю 28.09–04.10',
    describe: fileAttached => (fileAttached ? 'с файлом' : 'без файла'),
    fileName: 'Дубли сделок 28.09-04.10.xlsx',
    file: Buffer.from('xlsx'),
});

const OPTIONS = {
    deadline: DEADLINE,
    timezone: ETimeZone.EUROPE_MOSCOW,
    ownerId: OWNER,
};

const setup = (previous: number | null = null, remembered: number[] = []) => {
    const bitrix = {
        disk: {
            storage: {
                getlist: jest
                    .fn()
                    .mockResolvedValue({ result: [{ ID: '1357' }] }),
                getchildren: jest
                    .fn()
                    .mockResolvedValue({ result: [{ ID: '2468' }] }),
                addfolder: jest
                    .fn()
                    .mockResolvedValue({ result: { ID: '2469' } }),
                uploadfile: jest
                    .fn()
                    .mockResolvedValue({ result: { ID: '9034' } }),
            },
            folder: {
                uploadfile: jest
                    .fn()
                    .mockResolvedValue({ result: { ID: '9035' } }),
            },
        },
        task: {
            add: jest
                .fn<Promise<unknown>, [Record<string, unknown>]>()
                .mockResolvedValue({ result: { task: { id: '765741' } } }),
            get: jest
                .fn()
                .mockResolvedValue({ result: { task: { status: '2' } } }),
            complete: jest.fn().mockResolvedValue({ result: {} }),
        },
    };
    const remember = jest
        .fn<Promise<void>, [string, number, number]>()
        .mockResolvedValue(undefined);
    const forget = jest
        .fn<Promise<void>, [string, number]>()
        .mockResolvedValue(undefined);
    const store: DuplicateTaskStorePort = {
        previous: jest
            .fn<Promise<number | null>, [string, number]>()
            .mockResolvedValue(previous),
        remember,
        recipients: jest
            .fn<Promise<number[]>, [string]>()
            .mockResolvedValue(remembered),
        forget,
    };
    const delivery = new DuplicateReportDelivery(
        bitrix as never,
        store,
        DOMAIN,
    );
    return { bitrix, remember, forget, delivery };
};

describe('доставка отчёта по дублям', () => {
    it('файл — в папку отчётов личного Диска владельца вебхука, задача — с вложением и сроком', async () => {
        const { bitrix, delivery } = setup();
        const warnings: string[] = [];

        const outcome = await delivery.deliver(item(), OPTIONS, warnings);

        expect(outcome).toEqual({ taskId: 765741, closedPrevious: false });
        expect(bitrix.disk.storage.getlist).toHaveBeenCalledWith({
            ENTITY_TYPE: 'user',
            ENTITY_ID: OWNER,
        });
        expect(bitrix.disk.storage.getchildren).toHaveBeenCalledWith({
            id: 1357,
            filter: { NAME: 'Отчёты по дублям сделок', TYPE: 'folder' },
        });
        expect(bitrix.disk.storage.addfolder).not.toHaveBeenCalled();
        expect(bitrix.disk.folder.uploadfile).toHaveBeenCalledWith({
            id: 2468,
            data: { NAME: 'Дубли сделок 28.09-04.10.xlsx' },
            fileContent: [
                'Дубли сделок 28.09-04.10.xlsx',
                Buffer.from('xlsx').toString('base64'),
            ],
            generateUniqueName: true,
        });
        expect(bitrix.task.add).toHaveBeenCalledWith({
            TITLE: 'Дубли сделок: отчёт за неделю 28.09–04.10',
            DESCRIPTION: 'с файлом',
            DESCRIPTION_IN_BBCODE: 'Y',
            RESPONSIBLE_ID: 11,
            CREATED_BY: OWNER,
            DEADLINE: '2026-10-07 18:00:00',
            UF_TASK_WEBDAV_FILES: ['n9035'],
        });
        expect(warnings).toEqual([]);
    });

    it('закрывает прошлую открытую задачу-отчёт и запоминает новую', async () => {
        const { bitrix, remember, delivery } = setup(700001);

        const outcome = await delivery.deliver(item(), OPTIONS, []);

        expect(outcome.closedPrevious).toBe(true);
        expect(bitrix.task.get).toHaveBeenCalledWith(700001, ['ID', 'STATUS']);
        expect(bitrix.task.complete).toHaveBeenCalledWith(700001);
        expect(remember).toHaveBeenCalledWith(DOMAIN, 11, 765741);
        // Закрываем ПОСЛЕ создания новой: без новой у человека не осталось бы ничего.
        expect(bitrix.task.add.mock.invocationCallOrder[0]).toBeLessThan(
            bitrix.task.complete.mock.invocationCallOrder[0],
        );
    });

    it('прошлая задача уже завершена — её не трогаем', async () => {
        const { bitrix, delivery } = setup(700001);
        bitrix.task.get.mockResolvedValue({
            result: { task: { status: '5' } },
        });

        const outcome = await delivery.deliver(item(), OPTIONS, []);

        expect(outcome.closedPrevious).toBe(false);
        expect(bitrix.task.complete).not.toHaveBeenCalled();
    });

    it('личный Диск не найден — задачи без файла, хранилище ищется один раз', async () => {
        const { bitrix, delivery } = setup();
        bitrix.disk.storage.getlist.mockResolvedValue({ result: [] });
        const warnings: string[] = [];

        await delivery.deliver(item(11), OPTIONS, warnings);
        await delivery.deliver(item(12), OPTIONS, warnings);

        expect(bitrix.disk.storage.getlist).toHaveBeenCalledTimes(1);
        expect(bitrix.disk.folder.uploadfile).not.toHaveBeenCalled();
        expect(bitrix.task.add).toHaveBeenCalledTimes(2);
        expect(bitrix.task.add.mock.calls[0][0]).toMatchObject({
            DESCRIPTION: 'без файла',
        });
        expect(bitrix.task.add.mock.calls[0][0]).not.toHaveProperty(
            'UF_TASK_WEBDAV_FILES',
        );
        expect(warnings).toEqual([
            `личный Диск сотрудника ${OWNER} не найден — файлы отчёта не загружены`,
        ]);
    });

    it('загрузка упала — задача всё равно ставится, без файла', async () => {
        const { bitrix, delivery } = setup();
        bitrix.disk.folder.uploadfile.mockRejectedValue(
            new Error('insufficient_scope'),
        );
        const warnings: string[] = [];

        const outcome = await delivery.deliver(item(), OPTIONS, warnings);

        expect(outcome.taskId).toBe(765741);
        expect(bitrix.task.add.mock.calls[0][0]).toMatchObject({
            DESCRIPTION: 'без файла',
        });
        expect(warnings).toEqual([
            'файл «Дубли сделок 28.09-04.10.xlsx» не загружен на Диск: insufficient_scope',
        ]);
    });

    it('владелец вебхука неизвестен — без постановщика и без файла', async () => {
        const { bitrix, delivery } = setup();
        const warnings: string[] = [];

        await delivery.deliver(item(), { ...OPTIONS, ownerId: null }, warnings);

        expect(bitrix.disk.storage.getlist).not.toHaveBeenCalled();
        expect(bitrix.task.add.mock.calls[0][0]).not.toHaveProperty(
            'CREATED_BY',
        );
        expect(warnings).toHaveLength(1);
    });

    it('задача не создалась — прошлая не закрывается и не забывается', async () => {
        const { bitrix, remember, delivery } = setup(700001);
        bitrix.task.add.mockRejectedValue(new Error('ERROR_CORE'));
        const warnings: string[] = [];

        const outcome = await delivery.deliver(item(), OPTIONS, warnings);

        expect(outcome).toEqual({ taskId: null, closedPrevious: false });
        expect(bitrix.task.complete).not.toHaveBeenCalled();
        expect(remember).not.toHaveBeenCalled();
        expect(warnings).toEqual([
            'задача-отчёт сотруднику 11 не создана: ERROR_CORE',
        ]);
    });

    it('закрыть прошлую не удалось — предупреждение, новая всё равно запомнена', async () => {
        const { bitrix, remember, delivery } = setup(700001);
        bitrix.task.complete.mockRejectedValue(new Error('Access denied'));
        const warnings: string[] = [];

        const outcome = await delivery.deliver(item(), OPTIONS, warnings);

        expect(outcome).toEqual({ taskId: 765741, closedPrevious: false });
        expect(remember).toHaveBeenCalledWith(DOMAIN, 11, 765741);
        expect(warnings).toEqual([
            'прошлая задача-отчёт 700001 не закрыта: Access denied',
        ]);
    });

    it('папки нет — создаётся один раз на прогон, файлы ложатся в неё', async () => {
        const { bitrix, delivery } = setup();
        bitrix.disk.storage.getchildren.mockResolvedValue({ result: [] });

        await delivery.deliver(item(11), OPTIONS, []);
        await delivery.deliver(item(12), OPTIONS, []);

        expect(bitrix.disk.storage.addfolder).toHaveBeenCalledTimes(1);
        expect(bitrix.disk.storage.addfolder).toHaveBeenCalledWith({
            id: 1357,
            data: { NAME: 'Отчёты по дублям сделок' },
        });
        expect(
            bitrix.disk.folder.uploadfile.mock.calls.map(
                ([req]) => (req as { id: number }).id,
            ),
        ).toEqual([2469, 2469]);
    });

    it('папку не создать — файл в корень Диска, задача с вложением', async () => {
        const { bitrix, delivery } = setup();
        bitrix.disk.storage.getchildren.mockRejectedValue(new Error('denied'));
        const warnings: string[] = [];

        const outcome = await delivery.deliver(item(), OPTIONS, warnings);

        expect(outcome.taskId).toBe(765741);
        expect(bitrix.disk.storage.uploadfile).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1357 }),
        );
        expect(bitrix.task.add.mock.calls[0][0]).toMatchObject({
            UF_TASK_WEBDAV_FILES: ['n9034'],
        });
        expect(warnings).toEqual([
            expect.stringContaining('файлы легли в корень Диска'),
        ]);
    });

    it('кому отчёта больше нет — прошлая задача закрывается и забывается; текущих не трогаем', async () => {
        const { bitrix, forget, delivery } = setup(700001, [11, 12]);

        const closed = await delivery.closeStale([11], []);

        expect(closed).toBe(1);
        expect(bitrix.task.complete).toHaveBeenCalledTimes(1);
        expect(bitrix.task.complete).toHaveBeenCalledWith(700001);
        expect(forget).toHaveBeenCalledWith(DOMAIN, 12);
        expect(forget).not.toHaveBeenCalledWith(DOMAIN, 11);
    });
});
