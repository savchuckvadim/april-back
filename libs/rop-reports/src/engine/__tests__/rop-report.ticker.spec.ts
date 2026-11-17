import { Logger } from '@nestjs/common';
import { ROP_PERIOD_KIND } from '../../period/rop-period';
import { RopPeriodRunner } from '../rop-period.runner';
import { RopReportTicker } from '../rop-report.ticker';
import {
    DOMAIN,
    fixedPolicy,
    KEYS,
    makeDefinition,
    OCTOBER,
    WEEK_46,
} from './fixtures/definition.fixture';

/** Понедельник 16.11.2026 10:00 по Москве. */
const NOW = new Date('2026-11-16T07:00:00.000Z');

const setup = (...args: Parameters<typeof makeDefinition>) => {
    const parts = makeDefinition(...args);
    const ticker = new RopReportTicker(
        parts.state,
        new RopPeriodRunner(parts.state),
    );
    return { ...parts, ticker };
};

/** Сообщения в Telegram: вызовы журнала с пометкой `telegram: true`. */
const telegramMessages = (spy: jest.SpyInstance): string[] =>
    spy.mock.calls
        .filter(
            ([, meta]) =>
                (meta as { telegram?: boolean } | undefined)?.telegram,
        )
        .map(([message]) => String(message));

describe('движок отчётов РОПу', () => {
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    describe('тик крона', () => {
        it('пора — прогон периода, итог в Telegram', async () => {
            const { ticker, definition, run, resolveCalendar } = setup();

            await ticker.tick(definition, NOW);

            expect(resolveCalendar).toHaveBeenCalledWith(DOMAIN);
            expect(run).toHaveBeenCalledTimes(1);
            expect(run.mock.calls[0][0].mode).toEqual({
                countOnly: false,
                previewUserId: null,
                force: false,
            });
            const [message] = telegramMessages(log);
            expect(message).toContain('Итоги периода по менеджерам');
            expect(message).toContain(`${DOMAIN} · 09.11–15.11`);
            expect(message).toContain('задач поставлено 2 из 2');
        });

        it('период уже выпущен — повторно не выпускается, в Telegram тишина', async () => {
            const { ticker, definition, run, state } = setup();
            await state.markReleased(
                KEYS.released(DOMAIN, ROP_PERIOD_KIND.week, false),
                WEEK_46.key,
                60,
            );

            await ticker.tick(definition, NOW);

            expect(run).not.toHaveBeenCalled();
            expect(telegramMessages(log)).toEqual([]);
        });

        it('ещё не время — ждём, в Telegram тишина', async () => {
            const { ticker, definition, run } = setup({
                policies: [fixedPolicy(null)],
            });

            await ticker.tick(definition, NOW);

            expect(run).not.toHaveBeenCalled();
            expect(telegramMessages(log)).toEqual([]);
        });

        it('неделя и месяц в один день — два прогона, две метки', async () => {
            const { ticker, definition, run, state } = setup({
                policies: [fixedPolicy(WEEK_46), fixedPolicy(OCTOBER)],
            });

            await ticker.tick(definition, NOW);

            expect(
                run.mock.calls.map(([context]) => context.period.key),
            ).toEqual(['2026-W46', '2026-10']);
            expect(
                await state.released(
                    KEYS.released(DOMAIN, ROP_PERIOD_KIND.month, false),
                ),
            ).toBe('2026-10');
        });

        it('«только считать» из настроек — метка своя, прогон без задач', async () => {
            const { ticker, definition, run, state } = setup({
                countOnly: true,
            });

            await ticker.tick(definition, NOW);

            expect(run.mock.calls[0][0].mode.countOnly).toBe(true);
            expect(
                await state.released(
                    KEYS.released(DOMAIN, ROP_PERIOD_KIND.week, true),
                ),
            ).toBe('2026-W46');
            expect(telegramMessages(log)[0]).toContain('только считать');
        });

        it('отчёт нигде не включён — без замка и без прогона', async () => {
            const { ticker, definition, run, enabledDomains, redis } = setup();
            enabledDomains.mockResolvedValue([]);

            await ticker.tick(definition, NOW);

            expect(run).not.toHaveBeenCalled();
            expect(redis.set).not.toHaveBeenCalled();
        });

        it('порталы не прочитаны — тик пропущен, ошибка в Telegram', async () => {
            const { ticker, definition, run, enabledDomains } = setup();
            enabledDomains.mockRejectedValue(new Error('БД недоступна'));

            await ticker.tick(definition, NOW);

            expect(run).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalledWith(
                expect.stringContaining('порталы не прочитаны: БД недоступна'),
                { telegram: true },
            );
        });

        it('прошлый тик ещё идёт — пропуск', async () => {
            const { ticker, definition, run, state } = setup();
            await state.lock(KEYS.tickLock(), 60);

            await ticker.tick(definition, NOW);

            expect(run).not.toHaveBeenCalled();
        });

        it('сбой одного портала цикл не роняет — следующий портал прогоняется', async () => {
            const { ticker, definition, run, enabledDomains, resolveOptions } =
                setup();
            enabledDomains.mockResolvedValue(['broken.bitrix24.ru', DOMAIN]);
            resolveOptions.mockImplementation((domain: string) =>
                Promise.resolve({
                    countOnly: false,
                    policies:
                        domain === DOMAIN
                            ? [fixedPolicy(WEEK_46)]
                            : [
                                  {
                                      kind: ROP_PERIOD_KIND.week,
                                      due: () => {
                                          throw new Error('сломанная политика');
                                      },
                                  },
                              ],
                }),
            );

            await ticker.tick(definition, NOW);

            expect(run.mock.calls.map(([context]) => context.domain)).toEqual([
                DOMAIN,
            ]);
            const [message] = telegramMessages(log);
            expect(message).toContain(
                '❌ broken.bitrix24.ru: ошибка — сломанная политика',
            );
        });

        it('настройки портала не прочитаны — в Telegram первая неудача суток, дальше тихо', async () => {
            const { ticker, definition, run, resolveOptions } = setup();
            resolveOptions.mockRejectedValue(new Error('нет строки настроек'));

            await ticker.tick(definition, NOW);
            await ticker.tick(definition, NOW);

            expect(run).not.toHaveBeenCalled();
            const messages = telegramMessages(log);
            expect(messages).toHaveLength(1);
            expect(messages[0]).toContain(
                'настройки портала не прочитаны: нет строки настроек',
            );
        });
    });

    describe('ручной запуск', () => {
        it('без ключа — последний закрытый период вида, задачи по настройке', async () => {
            const { ticker, definition, run } = setup();

            const outcome = await ticker.runNow(
                definition,
                { domain: DOMAIN, kind: ROP_PERIOD_KIND.month },
                NOW,
            );

            expect(outcome.kind).toBe('ran');
            expect(run.mock.calls[0][0].period.key).toBe('2026-10');
            expect(run.mock.calls[0][0].mode).toEqual({
                countOnly: false,
                previewUserId: null,
                force: true,
            });
            expect(telegramMessages(log)).toHaveLength(1);
        });

        it('по ключу периода и «только посчитать»', async () => {
            const { ticker, definition, run, resolveOptions } = setup();

            await ticker.runNow(
                definition,
                {
                    domain: DOMAIN,
                    kind: ROP_PERIOD_KIND.week,
                    periodKey: '2026-W40',
                    countOnly: true,
                },
                NOW,
            );

            expect(resolveOptions).toHaveBeenCalledWith(DOMAIN, {
                countOnly: true,
            });
            expect(run.mock.calls[0][0].period.key).toBe('2026-W40');
            expect(run.mock.calls[0][0].mode.countOnly).toBe(true);
        });

        it('проба одному сотруднику ставит задачу даже при «только считать»', async () => {
            const { ticker, definition, run } = setup({ countOnly: true });

            await ticker.runNow(
                definition,
                {
                    domain: DOMAIN,
                    kind: ROP_PERIOD_KIND.week,
                    previewUserId: 11,
                },
                NOW,
            );

            expect(run.mock.calls[0][0].mode).toEqual({
                countOnly: false,
                previewUserId: 11,
                force: true,
            });
        });

        it('чужой ключ периода — сбой с понятной причиной, без прогона', async () => {
            const { ticker, definition, run } = setup();

            const outcome = await ticker.runNow(
                definition,
                {
                    domain: DOMAIN,
                    kind: ROP_PERIOD_KIND.week,
                    periodKey: '2026-13',
                },
                NOW,
            );

            expect(run).not.toHaveBeenCalled();
            expect(outcome).toMatchObject({
                kind: 'failed',
                period: null,
                error: 'период «2026-13» не разобран — проверьте ключ периода',
            });
        });

        it('портал занят кроном — «занят», без сообщения: очередь повторит', async () => {
            const { ticker, definition, run, state } = setup();
            await state.lock(KEYS.lock(DOMAIN), 60);

            const outcome = await ticker.runNow(
                definition,
                { domain: DOMAIN, kind: ROP_PERIOD_KIND.week },
                NOW,
            );

            expect(outcome.kind).toBe('busy');
            expect(run).not.toHaveBeenCalled();
            expect(telegramMessages(log)).toEqual([]);
        });
    });
});
