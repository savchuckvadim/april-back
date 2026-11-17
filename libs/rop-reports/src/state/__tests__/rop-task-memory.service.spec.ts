import { RopTaskMemoryService } from '../rop-task-memory.service';
import { FakeRedis } from './fixtures/fake-redis.fixture';

const TASK = 'r:task:week:d:11';
const RECIPIENTS = 'r:recipients:week:d';

const setup = () => {
    const redis = new FakeRedis();
    return { redis, memory: new RopTaskMemoryService(redis.service()) };
};

describe('память задач-отчётов получателя', () => {
    it('помнит период и задачу, получателя — в множестве, со сроком', async () => {
        const { redis, memory } = setup();

        await memory.remember(
            TASK,
            RECIPIENTS,
            11,
            { periodKey: '2026-W46', taskId: 765741 },
            7776000,
        );

        expect(await memory.previous(TASK)).toEqual({
            periodKey: '2026-W46',
            taskId: 765741,
        });
        expect(await memory.recipients(RECIPIENTS)).toEqual([11]);
        expect(redis.ttl.get(TASK)).toBe(7776000);
        expect(redis.ttl.get(RECIPIENTS)).toBe(7776000);
    });

    it('забыть: задача и место в множестве', async () => {
        const { memory } = setup();
        await memory.remember(
            TASK,
            RECIPIENTS,
            11,
            { periodKey: 'p', taskId: 1 },
            60,
        );
        await memory.remember(
            'r:task:week:d:12',
            RECIPIENTS,
            12,
            { periodKey: 'p', taskId: 2 },
            60,
        );

        await memory.forget(TASK, RECIPIENTS, 11);

        expect(await memory.previous(TASK)).toBeNull();
        expect(await memory.recipients(RECIPIENTS)).toEqual([12]);
    });

    it('чужая или битая запись — как будто задачи не было', async () => {
        const { redis, memory } = setup();
        for (const raw of [
            '765741',
            '{',
            '{"periodKey":"","taskId":5}',
            '{"periodKey":"p","taskId":0}',
        ]) {
            redis.values.set(TASK, raw);
            expect(await memory.previous(TASK)).toBeNull();
        }
    });

    it('мусор в множестве получателей отбрасывается', async () => {
        const { redis, memory } = setup();
        redis.sets.set(RECIPIENTS, new Set(['11', 'x', '0']));

        expect(await memory.recipients(RECIPIENTS)).toEqual([11]);
    });
});
