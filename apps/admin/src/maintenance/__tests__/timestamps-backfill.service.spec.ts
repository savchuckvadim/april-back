import {
    resolveTimestamps,
    TimestampDelegate,
    TimestampRow,
    TimestampsBackfillService,
} from '../services/timestamps-backfill.service';
import { TimestampsBackfillTableEnum } from '../dto/timestamps-backfill.dto';

type FindManyArgs = Parameters<TimestampDelegate['findMany']>[0];
type UpdateArgs = Parameters<TimestampDelegate['update']>[0];

/** Prisma-делегат-заглушка: отдаёт заранее заданные строки, пишет в журнал. */
interface Delegate {
    findMany: jest.Mock<Promise<TimestampRow[]>, [FindManyArgs]>;
    update: jest.Mock<Promise<void>, [UpdateArgs]>;
}

const makeDelegate = (rows: TimestampRow[]): Delegate => ({
    findMany: jest.fn<Promise<TimestampRow[]>, [FindManyArgs]>(() =>
        Promise.resolve(rows),
    ),
    update: jest.fn<Promise<void>, [UpdateArgs]>(() => Promise.resolve()),
});

/** Собирает сервис поверх подменённого prisma со всеми таблицами списка. */
const makeService = (
    overrides: Partial<Record<TimestampsBackfillTableEnum, TimestampRow[]>>,
): {
    service: TimestampsBackfillService;
    delegates: Record<string, Delegate>;
} => {
    const delegates: Record<string, Delegate> = {};
    for (const table of Object.values(TimestampsBackfillTableEnum)) {
        delegates[table] = makeDelegate(overrides[table] ?? []);
    }
    const service = new TimestampsBackfillService(delegates as never);
    return { service, delegates };
};

describe('resolveTimestamps', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');

    it('пустой created_at берёт из updated_at, а не из времени починки', () => {
        const updated = new Date('2024-01-02T03:04:05.000Z');
        const result = resolveTimestamps(
            { id: 1n, created_at: null, updated_at: updated },
            now,
        );
        expect(result.created_at).toEqual(updated);
        expect(result.updated_at).toEqual(updated);
    });

    it('пустой updated_at берёт из created_at', () => {
        const created = new Date('2023-05-06T07:08:09.000Z');
        const result = resolveTimestamps(
            { id: 2n, created_at: created, updated_at: null },
            now,
        );
        expect(result.created_at).toEqual(created);
        expect(result.updated_at).toEqual(created);
    });

    it('обе пустые — ставит переданное now', () => {
        const result = resolveTimestamps(
            { id: 3n, created_at: null, updated_at: null },
            now,
        );
        expect(result.created_at).toEqual(now);
        expect(result.updated_at).toEqual(now);
    });
});

describe('TimestampsBackfillService', () => {
    it('по умолчанию не пишет в БД и только считает', async () => {
        const { service, delegates } = makeService({
            [TimestampsBackfillTableEnum.BTX_STAGES]: [
                { id: 1n, created_at: null, updated_at: null },
                { id: 2n, created_at: null, updated_at: null },
            ],
        });

        const result = await service.backfill({});

        expect(result.dryRun).toBe(true);
        expect(result.totalBroken).toBe(2);
        expect(result.totalRepaired).toBe(0);
        expect(
            delegates[TimestampsBackfillTableEnum.BTX_STAGES].update,
        ).not.toHaveBeenCalled();
    });

    it('с dryRun: false чинит каждую битую строку', async () => {
        const updated = new Date('2024-01-02T03:04:05.000Z');
        const { service, delegates } = makeService({
            [TimestampsBackfillTableEnum.BTX_STAGES]: [
                { id: 7n, created_at: null, updated_at: updated },
            ],
        });

        const result = await service.backfill({ dryRun: false });

        expect(result.totalRepaired).toBe(1);
        const update = delegates[TimestampsBackfillTableEnum.BTX_STAGES].update;
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]).toEqual({
            where: { id: 7n },
            // Обе даты передаются всегда: иначе laravelTimestampsExtension
            // подставит updated_at = now() и затрёт реальную дату.
            data: { created_at: updated, updated_at: updated },
        });
    });

    it('таблицы без битых строк в ответ не попадают', async () => {
        const { service } = makeService({
            [TimestampsBackfillTableEnum.SMARTS]: [
                { id: 1n, created_at: null, updated_at: null },
            ],
        });

        const result = await service.backfill({});

        expect(result.tables).toHaveLength(1);
        expect(result.tables[0].table).toBe(TimestampsBackfillTableEnum.SMARTS);
    });

    it('сужение по tables не трогает остальные таблицы', async () => {
        const { service, delegates } = makeService({
            [TimestampsBackfillTableEnum.BTX_STAGES]: [
                { id: 1n, created_at: null, updated_at: null },
            ],
            [TimestampsBackfillTableEnum.SMARTS]: [
                { id: 2n, created_at: null, updated_at: null },
            ],
        });

        const result = await service.backfill({
            tables: [TimestampsBackfillTableEnum.BTX_STAGES],
        });

        expect(result.scannedTables).toBe(1);
        expect(result.totalBroken).toBe(1);
        expect(
            delegates[TimestampsBackfillTableEnum.SMARTS].findMany,
        ).not.toHaveBeenCalled();
    });

    it('читает только строки с пустыми таймстампами', async () => {
        const { service, delegates } = makeService({});

        await service.backfill({
            tables: [TimestampsBackfillTableEnum.BX_RQS],
        });

        const findMany = delegates[TimestampsBackfillTableEnum.BX_RQS].findMany;
        expect(findMany.mock.calls[0][0].where).toEqual({
            OR: [{ created_at: null }, { updated_at: null }],
        });
    });
});
