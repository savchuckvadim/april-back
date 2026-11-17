import { Logger } from '@nestjs/common';
import { ROP_PERIOD_KIND } from '../../period/rop-period';
import { RopRunStateService } from '../rop-run-state.service';
import {
    parseRopRunSummary,
    ROP_RUN_STATUS,
    RopRunSummary,
} from '../rop-run-summary';
import { FakeRedis } from './fixtures/fake-redis.fixture';

const LOCK = 'r:lock:d';
const MARK = 'r:released:week:d';
const FAILED = 'r:failed:week:d';
const LAST = 'r:last-run:week:d';

const summary = (patch: Partial<RopRunSummary> = {}): RopRunSummary => ({
    kind: ROP_PERIOD_KIND.week,
    periodKey: '2026-W46',
    at: '2026-11-16T06:00:00.000Z',
    status: ROP_RUN_STATUS.ran,
    countOnly: false,
    preview: false,
    recipients: 2,
    tasksCreated: 2,
    tasksAlreadyDone: 0,
    tasksClosed: 1,
    summary: ['Карточек: 6'],
    warnings: [],
    error: null,
    ...patch,
});

const setup = () => {
    const redis = new FakeRedis();
    return { redis, state: new RopRunStateService(redis.service()) };
};

describe('состояние прогонов отчётов РОПу в Redis', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    describe('замок с токеном', () => {
        it('второй прогон замок не получает, пока первый его держит', async () => {
            const { redis, state } = setup();
            const token = await state.lock(LOCK, 1800);

            expect(token).toEqual(expect.any(String));
            expect(redis.ttl.get(LOCK)).toBe(1800);
            expect(await state.lock(LOCK, 1800)).toBeNull();
            expect(await state.isLocked(LOCK)).toBe(true);
        });

        it('снять и продлить можно только своим токеном', async () => {
            const { redis, state } = setup();
            const token = (await state.lock(LOCK, 60)) ?? '';

            await state.extend(LOCK, 'чужой', 999);
            await state.unlock(LOCK, 'чужой');
            expect(redis.ttl.get(LOCK)).toBe(60);
            expect(await state.isLocked(LOCK)).toBe(true);

            await state.extend(LOCK, token, 900);
            expect(redis.ttl.get(LOCK)).toBe(900);
            await state.unlock(LOCK, token);
            expect(await state.isLocked(LOCK)).toBe(false);
        });

        it('Redis недоступен — замка нет, исключения нет', async () => {
            const { redis, state } = setup();
            redis.fail = true;

            expect(await state.lock(LOCK, 60)).toBeNull();
            await expect(state.extend(LOCK, 't', 60)).resolves.toBeUndefined();
            await expect(state.unlock(LOCK, 't')).resolves.toBeUndefined();
            expect(await state.isLocked(LOCK)).toBe(false);
        });
    });

    describe('метки выпуска', () => {
        it('метка ставится со сроком и читается обратно', async () => {
            const { redis, state } = setup();
            expect(await state.released(MARK)).toBeNull();

            await state.markReleased(MARK, '2026-W46', 1296000);

            expect(await state.released(MARK)).toBe('2026-W46');
            expect(redis.ttl.get(MARK)).toBe(1296000);
        });

        it('сбой чтения — «метки нет», сбой записи — тихо', async () => {
            const { redis, state } = setup();
            redis.fail = true;

            expect(await state.released(MARK)).toBeNull();
            await expect(
                state.markReleased(MARK, '2026-W46', 60),
            ).resolves.toBeUndefined();
        });
    });

    describe('счётчик неудач', () => {
        it('попытки периода считаются подряд, другой период — заново', async () => {
            const { state } = setup();

            expect(await state.registerFailure(FAILED, '2026-W46', 60)).toBe(1);
            expect(await state.registerFailure(FAILED, '2026-W46', 60)).toBe(2);
            expect(await state.failures(FAILED)).toEqual({
                periodKey: '2026-W46',
                attempt: 2,
            });
            expect(await state.registerFailure(FAILED, '2026-W47', 60)).toBe(1);

            await state.clearFailures(FAILED);
            expect(await state.failures(FAILED)).toBeNull();
        });

        it('мусор в счётчике — как будто неудач не было', async () => {
            const { redis, state } = setup();
            redis.values.set(FAILED, 'мусор');

            expect(await state.failures(FAILED)).toBeNull();
            expect(await state.registerFailure(FAILED, '2026-W46', 60)).toBe(1);
        });
    });

    describe('итог последнего прогона', () => {
        it('сохраняется с первыми десятью предупреждениями и читается обратно', async () => {
            const { state } = setup();
            const warnings = Array.from({ length: 12 }, (_, i) => `сбой ${i}`);

            await state.saveLastRun(LAST, summary({ warnings }), 60);
            const stored = await state.lastRun(LAST);

            expect(stored).toEqual(
                summary({ warnings: warnings.slice(0, 10) }),
            );
        });

        it('битая или чужая запись — null', async () => {
            const { redis, state } = setup();
            redis.values.set(LAST, '{не json');
            expect(await state.lastRun(LAST)).toBeNull();

            expect(
                parseRopRunSummary(JSON.stringify({ kind: 'day' })),
            ).toBeNull();
            expect(
                parseRopRunSummary(
                    JSON.stringify({ ...summary(), tasksCreated: -1 }),
                ),
            ).toBeNull();
            expect(parseRopRunSummary(null)).toBeNull();
        });
    });
});
