import { Logger } from '@nestjs/common';
import { ROP_PERIOD_KIND } from '../../period/rop-period';
import { ROP_RUN_STATUS } from '../../state/rop-run-summary';
import { RopPeriodRunner } from '../rop-period.runner';
import { RopRunMode } from '../rop-report.definition';
import {
    DOMAIN,
    KEYS,
    makeDefinition,
    PORTAL,
    result,
    WEEK_46,
} from './fixtures/definition.fixture';

const NOW = new Date('2026-11-16T07:00:00.000Z');
const CRON: RopRunMode = {
    countOnly: false,
    previewUserId: null,
    force: false,
};
const MANUAL: RopRunMode = {
    countOnly: false,
    previewUserId: null,
    force: true,
};
const WEEK = ROP_PERIOD_KIND.week;

const setup = (mode: RopRunMode = CRON) => {
    const parts = makeDefinition();
    const runner = new RopPeriodRunner(parts.state);
    const extendTick = jest.fn(() => Promise.resolve());
    const runOnce = (runMode: RopRunMode = mode) =>
        runner.run({
            definition: parts.definition,
            domain: DOMAIN,
            period: WEEK_46,
            options: { countOnly: runMode.countOnly, policies: [] },
            portal: PORTAL,
            mode: runMode,
            now: NOW,
            extendTick,
        });
    return { ...parts, runner, runOnce, extendTick };
};

describe('прогон периода отчёта РОПу', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('крон: доставлено — метка выпуска, сброс неудач, итог для админки', async () => {
        const { run, state, runOnce } = setup();
        await state.registerFailure(
            KEYS.failures(DOMAIN, WEEK),
            WEEK_46.key,
            60,
        );

        const outcome = await runOnce();

        expect(outcome.kind).toBe('ran');
        const context = run.mock.calls[0][0];
        expect(context.period).toMatchObject({
            key: '2026-W46',
            fromAt: new Date('2026-11-08T21:00:00.000Z'),
            toAt: new Date('2026-11-15T21:00:00.000Z'),
        });
        expect(await state.released(KEYS.released(DOMAIN, WEEK, false))).toBe(
            '2026-W46',
        );
        expect(await state.failures(KEYS.failures(DOMAIN, WEEK))).toBeNull();
        expect(await state.lastRun(KEYS.lastRun(DOMAIN, WEEK))).toMatchObject({
            periodKey: '2026-W46',
            status: ROP_RUN_STATUS.ran,
            tasksCreated: 2,
            at: NOW.toISOString(),
        });
        expect(await state.isLocked(KEYS.lock(DOMAIN))).toBe(false);
    });

    it('«только считать» — своя метка выпуска', async () => {
        const { state, runOnce } = setup({ ...CRON, countOnly: true });

        await runOnce();

        expect(await state.released(KEYS.released(DOMAIN, WEEK, true))).toBe(
            '2026-W46',
        );
        expect(
            await state.released(KEYS.released(DOMAIN, WEEK, false)),
        ).toBeNull();
    });

    it('портал занят ручным запуском — «занят», без прогона и без счёта неудачи', async () => {
        const { run, state, runOnce } = setup();
        await state.lock(KEYS.lock(DOMAIN), 60);

        expect((await runOnce()).kind).toBe('busy');
        expect(run).not.toHaveBeenCalled();
        expect(await state.failures(KEYS.failures(DOMAIN, WEEK))).toBeNull();
    });

    it('задачи не всем — попытка: первая в Telegram, дальше тихо, после пятой период закрыт', async () => {
        const { run, state, runOnce } = setup();
        run.mockResolvedValue(
            result({
                tasksCreated: 1,
                warnings: ['задача-отчёт сотруднику 12 не создана'],
            }),
        );

        const first = await runOnce();
        expect(first).toMatchObject({ kind: 'failed', attempt: 1 });
        expect(first.kind === 'failed' && first.error).toContain('1 из 2');
        expect((await runOnce()).kind).toBe('retrying');
        await runOnce();
        await runOnce();
        expect(
            await state.released(KEYS.released(DOMAIN, WEEK, false)),
        ).toBeNull();

        const last = await runOnce();
        expect(last).toMatchObject({
            kind: 'failed',
            attempt: 5,
            gaveUp: true,
        });
        expect(await state.released(KEYS.released(DOMAIN, WEEK, false))).toBe(
            '2026-W46',
        );
    });

    it('задачи уже стояли с прошлой попытки — период доставлен', async () => {
        const { run, runOnce } = setup();
        run.mockResolvedValue(result({ tasksCreated: 1, tasksAlreadyDone: 1 }));

        expect((await runOnce()).kind).toBe('ran');
    });

    it('прогон упал — попытка и итог со сбоем, замок снят', async () => {
        const { run, state, runOnce } = setup();
        run.mockRejectedValue(new Error('БД недоступна'));

        expect(await runOnce()).toMatchObject({
            kind: 'failed',
            attempt: 1,
            error: 'БД недоступна',
        });
        expect(await state.lastRun(KEYS.lastRun(DOMAIN, WEEK))).toMatchObject({
            status: ROP_RUN_STATUS.failed,
            error: 'БД недоступна',
        });
        expect(await state.isLocked(KEYS.lock(DOMAIN))).toBe(false);
    });

    it('ручной запуск с задачами закрывает период; «только посчитать» и проба — нет', async () => {
        const countOnly = setup();
        await countOnly.runOnce({ ...MANUAL, countOnly: true });
        expect(
            await countOnly.state.released(KEYS.released(DOMAIN, WEEK, true)),
        ).toBeNull();

        const preview = setup();
        await preview.runOnce({ ...MANUAL, previewUserId: 11 });
        expect(
            await preview.state.released(KEYS.released(DOMAIN, WEEK, false)),
        ).toBeNull();
        expect(
            await preview.state.lastRun(KEYS.lastRun(DOMAIN, WEEK)),
        ).toMatchObject({ preview: true });

        const full = setup();
        await full.runOnce(MANUAL);
        expect(
            await full.state.released(KEYS.released(DOMAIN, WEEK, false)),
        ).toBe('2026-W46');
    });

    it('сбой ручного запуска — просто итог, без счёта попыток', async () => {
        const { run, state, runOnce } = setup(MANUAL);
        run.mockRejectedValue(new Error('сбой'));

        const outcome = await runOnce();

        expect(outcome).toEqual({
            kind: 'failed',
            domain: DOMAIN,
            period: WEEK_46,
            error: 'сбой',
        });
        expect(await state.failures(KEYS.failures(DOMAIN, WEEK))).toBeNull();
    });

    it('сигнал «жив» продлевает замок портала и замок тика', async () => {
        const { run, redis, runOnce, extendTick } = setup();
        run.mockImplementation(async context => {
            await context.heartbeat();
            return result();
        });

        await runOnce();

        expect(extendTick).toHaveBeenCalledTimes(1);
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining("'expire'"),
            1,
            KEYS.lock(DOMAIN),
            expect.any(String),
            '1800',
        );
    });
});
