import { ETimeZone } from '@lib/shared/lib/date';
import { ROP_PERIOD_KIND } from '../../period/rop-period';
import { ropKeys } from '../../state/rop-keys';
import { RopTaskMemoryService } from '../../state/rop-task-memory.service';
import { FakeRedis } from '../../state/__tests__/fixtures/fake-redis.fixture';
import { RopDiskUploader } from '../rop-disk.uploader';
import {
    ROP_DISK_TARGET_KIND,
    ROP_REPORTS_FOLDER,
    RopDeliveryOptions,
    RopRenderedReport,
} from '../rop-delivery.types';
import { RopTaskChannel } from '../rop-task.channel';
import { makeDeliveryBitrix } from './fixtures/bitrix-delivery.fixture';

const DOMAIN = 'gsr.bitrix24.ru';
const OWNER = 447;
const KEYS = ropKeys('event-sales:period-digest');
const TTL = 7776000;

const OPTIONS: RopDeliveryOptions = {
    scope: {
        domain: DOMAIN,
        kind: ROP_PERIOD_KIND.week,
        periodKey: '2026-W46',
    },
    /** Среда 18.11.2026 18:00 по Москве. */
    deadline: new Date('2026-11-18T18:00:00+03:00'),
    timezone: ETimeZone.EUROPE_MOSCOW,
    ownerId: OWNER,
};

const report = (withFile = true): RopRenderedReport => ({
    title: 'Итоги недели 09.11–15.11: отдел «Продажи 1» (6 менеджеров)',
    describe: fileAttached => (fileAttached ? 'с файлом' : 'без файла'),
    file: withFile
        ? {
              name: 'Итоги недели 09.11-15.11.xlsx',
              content: Buffer.from('xlsx'),
          }
        : null,
});

const setup = () => {
    const { bitrix, service } = makeDeliveryBitrix();
    const redis = new FakeRedis();
    const memory = new RopTaskMemoryService(redis.service());
    const channel = new RopTaskChannel(
        service,
        new RopDiskUploader(service, {
            kind: ROP_DISK_TARGET_KIND.ownerFolder,
            name: ROP_REPORTS_FOLDER,
        }),
        memory,
        KEYS,
        TTL,
    );
    const rememberTask = (userId: number, periodKey: string, taskId: number) =>
        memory.remember(
            KEYS.task(DOMAIN, ROP_PERIOD_KIND.week, userId),
            KEYS.recipients(DOMAIN, ROP_PERIOD_KIND.week),
            userId,
            { periodKey, taskId },
            TTL,
        );
    return { bitrix, memory, channel, rememberTask };
};

describe('отчёт РОПу задачей', () => {
    it('файл — на Диск, задача — с вложением, сроком и постановщиком; память — с периодом', async () => {
        const { bitrix, memory, channel } = setup();
        const warnings: string[] = [];

        const outcome = await channel.deliver(11, report(), OPTIONS, warnings);

        expect(outcome).toEqual({
            taskId: 765741,
            alreadyDone: false,
            closedPrevious: false,
        });
        expect(bitrix.task.add).toHaveBeenCalledWith({
            TITLE: 'Итоги недели 09.11–15.11: отдел «Продажи 1» (6 менеджеров)',
            DESCRIPTION: 'с файлом',
            DESCRIPTION_IN_BBCODE: 'Y',
            RESPONSIBLE_ID: 11,
            CREATED_BY: OWNER,
            DEADLINE: '2026-11-18 18:00:00',
            UF_TASK_WEBDAV_FILES: ['n9035'],
        });
        expect(
            await memory.previous(KEYS.task(DOMAIN, ROP_PERIOD_KIND.week, 11)),
        ).toEqual({ periodKey: '2026-W46', taskId: 765741 });
        expect(warnings).toEqual([]);
    });

    it('повтор того же периода вторую задачу не ставит и файл не грузит', async () => {
        const { bitrix, channel, rememberTask } = setup();
        await rememberTask(11, '2026-W46', 700500);

        const outcome = await channel.deliver(11, report(), OPTIONS, []);

        expect(outcome).toEqual({
            taskId: 700500,
            alreadyDone: true,
            closedPrevious: false,
        });
        expect(bitrix.task.add).not.toHaveBeenCalled();
        expect(bitrix.disk.folder.uploadfile).not.toHaveBeenCalled();
    });

    it('прошлая задача того же вида другого периода закрывается — после создания новой', async () => {
        const { bitrix, channel, rememberTask } = setup();
        await rememberTask(11, '2026-W45', 700001);

        const outcome = await channel.deliver(11, report(), OPTIONS, []);

        expect(outcome.closedPrevious).toBe(true);
        expect(bitrix.task.get).toHaveBeenCalledWith(700001, ['ID', 'STATUS']);
        expect(bitrix.task.complete).toHaveBeenCalledWith(700001);
        expect(bitrix.task.add.mock.invocationCallOrder[0]).toBeLessThan(
            bitrix.task.complete.mock.invocationCallOrder[0],
        );
    });

    it('прошлая уже завершена — не трогаем', async () => {
        const { bitrix, channel, rememberTask } = setup();
        await rememberTask(11, '2026-W45', 700001);
        bitrix.task.get.mockResolvedValue({
            result: { task: { status: '5' } },
        });

        const outcome = await channel.deliver(11, report(), OPTIONS, []);

        expect(outcome.closedPrevious).toBe(false);
        expect(bitrix.task.complete).not.toHaveBeenCalled();
    });

    it('отчёт без файла — Диск не трогаем, описание «без файла»', async () => {
        const { bitrix, channel } = setup();

        await channel.deliver(11, report(false), OPTIONS, []);

        expect(bitrix.disk.storage.getlist).not.toHaveBeenCalled();
        expect(bitrix.task.add.mock.calls[0][0]).toMatchObject({
            DESCRIPTION: 'без файла',
        });
        expect(bitrix.task.add.mock.calls[0][0]).not.toHaveProperty(
            'UF_TASK_WEBDAV_FILES',
        );
    });

    it('владелец вебхука неизвестен — без постановщика', async () => {
        const { bitrix, channel } = setup();

        await channel.deliver(11, report(), { ...OPTIONS, ownerId: null }, []);

        expect(bitrix.task.add.mock.calls[0][0]).not.toHaveProperty(
            'CREATED_BY',
        );
    });

    it('задача не создалась — прошлая не закрывается и не забывается', async () => {
        const { bitrix, memory, channel, rememberTask } = setup();
        await rememberTask(11, '2026-W45', 700001);
        bitrix.task.add.mockRejectedValue(new Error('ERROR_CORE'));
        const warnings: string[] = [];

        const outcome = await channel.deliver(11, report(), OPTIONS, warnings);

        expect(outcome).toEqual({
            taskId: null,
            alreadyDone: false,
            closedPrevious: false,
        });
        expect(bitrix.task.complete).not.toHaveBeenCalled();
        expect(
            await memory.previous(KEYS.task(DOMAIN, ROP_PERIOD_KIND.week, 11)),
        ).toEqual({ periodKey: '2026-W45', taskId: 700001 });
        expect(warnings).toEqual([
            'задача-отчёт сотруднику 11 не создана: ERROR_CORE',
        ]);
    });

    it('Битрикс не вернул id — предупреждение', async () => {
        const { bitrix, channel } = setup();
        bitrix.task.add.mockResolvedValue({ result: {} });
        const warnings: string[] = [];

        expect(
            (await channel.deliver(11, report(), OPTIONS, warnings)).taskId,
        ).toBeNull();
        expect(warnings).toEqual([
            'задача-отчёт сотруднику 11 не создана: Битрикс не вернул id',
        ]);
    });

    it('закрыть прошлую не удалось — предупреждение, новая запомнена', async () => {
        const { bitrix, memory, channel, rememberTask } = setup();
        await rememberTask(11, '2026-W45', 700001);
        bitrix.task.complete.mockRejectedValue(new Error('Access denied'));
        const warnings: string[] = [];

        const outcome = await channel.deliver(11, report(), OPTIONS, warnings);

        expect(outcome.closedPrevious).toBe(false);
        expect(
            await memory.previous(KEYS.task(DOMAIN, ROP_PERIOD_KIND.week, 11)),
        ).toEqual({ periodKey: '2026-W46', taskId: 765741 });
        expect(warnings).toEqual([
            'прошлая задача-отчёт 700001 не закрыта: Access denied',
        ]);
    });

    it('кому отчёта больше нет — прошлая задача закрывается и забывается; текущих и задач этого периода не трогаем', async () => {
        const { bitrix, memory, channel, rememberTask } = setup();
        await rememberTask(11, '2026-W45', 700011);
        await rememberTask(12, '2026-W45', 700012);
        await rememberTask(13, '2026-W46', 700013);

        const closed = await channel.closeStale([11], OPTIONS, []);

        expect(closed).toBe(1);
        expect(bitrix.task.complete).toHaveBeenCalledTimes(1);
        expect(bitrix.task.complete).toHaveBeenCalledWith(700012);
        expect(
            await memory.recipients(
                KEYS.recipients(DOMAIN, ROP_PERIOD_KIND.week),
            ),
        ).toEqual([11, 13]);
    });
});
