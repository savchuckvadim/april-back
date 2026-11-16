import { Logger } from '@nestjs/common';
import {
    CallReportFactsCatchupScheduler,
    nightlyLimitNote,
} from '../cron/call-report-facts-catchup.scheduler';

/**
 * Ночной догон фактов (B6): джоба ставится только порталам с лимитом в
 * рублях, окно — прошлый и текущий месяц в поясе портала, сбой одного
 * портала не останавливает остальных.
 */
const NOW = new Date('2026-11-10T22:30:00Z');

const makeScheduler = (
    settings: Record<
        string,
        {
            factsCatchupNightlyBudgetRub?: number | null;
            factsCatchupNightlyMaxCalls?: number | null;
        } | null
    >,
) => {
    const dispatch = jest.fn().mockResolvedValue({ id: 'bull-1' });
    const scheduler = new CallReportFactsCatchupScheduler(
        {
            resolve: jest.fn().mockResolvedValue(
                Object.keys(settings).map(domain => ({
                    domain,
                    portalId: 1,
                })),
            ),
        } as never,
        {
            getByDomain: jest.fn((domain: string) => {
                const record = settings[domain];
                if (record === undefined) {
                    return Promise.reject(new Error('нет БД'));
                }
                return Promise.resolve(record);
            }),
        } as never,
        { dispatch } as never,
    );
    return { scheduler, dispatch };
};

describe('CallReportFactsCatchupScheduler', () => {
    afterEach(() => jest.restoreAllMocks());

    it('ставит джобу порталам с лимитом: прошлый и текущий месяц, лимит и метка ночи', async () => {
        const { scheduler, dispatch } = makeScheduler({
            'gsr.bitrix24.ru': { factsCatchupNightlyBudgetRub: 100 },
            'april-garant.bitrix24.ru': { factsCatchupNightlyBudgetRub: null },
            'alfacentr.bitrix24.ru': null,
        });

        await scheduler.tick(NOW);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-facts-catchup',
            {
                domain: 'gsr.bitrix24.ru',
                from: '2026-10-01',
                to: '2026-11-11',
                part: 1,
                budgetRub: 100,
                timeZone: 'Europe/Moscow',
                requestedBy: 'nightly',
            },
            'call-report-facts-catchup:gsr.bitrix24.ru:2026-10-01:2026-11-11:run:part-1',
            expect.objectContaining({ attempts: 1 }) as unknown,
        );
    });

    it('сбой чтения настроек одного портала — ошибка в лог, остальные ставятся', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const { scheduler, dispatch } = makeScheduler({
            'broken.bitrix24.ru': undefined as never,
            'gsr.bitrix24.ru': { factsCatchupNightlyBudgetRub: 50 },
        });

        await scheduler.tick(NOW);

        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('broken.bitrix24.ru'),
            expect.objectContaining({ telegram: true }),
        );
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    /** 16.11.2026: модели бесплатные — рублёвый лимит не срабатывает, нужен лимит в звонках. */
    it('лимит только в звонках — джоба ставится, рублёвого лимита в ней нет', async () => {
        const { scheduler, dispatch } = makeScheduler({
            'gsr.bitrix24.ru': { factsCatchupNightlyMaxCalls: 200 },
            'idle.bitrix24.ru': {
                factsCatchupNightlyBudgetRub: 0,
                factsCatchupNightlyMaxCalls: 0,
            },
        });

        await scheduler.tick(NOW);

        expect(dispatch).toHaveBeenCalledTimes(1);
        const [, , payload] = dispatch.mock.calls[0] as [
            string,
            string,
            Record<string, unknown>,
        ];
        expect(payload).toMatchObject({
            domain: 'gsr.bitrix24.ru',
            maxCalls: 200,
        });
        expect(payload).not.toHaveProperty('budgetRub');
    });

    it('оба лимита — оба уходят в джобу; подпись лимита называет заданные', async () => {
        const { scheduler, dispatch } = makeScheduler({
            'gsr.bitrix24.ru': {
                factsCatchupNightlyBudgetRub: 100,
                factsCatchupNightlyMaxCalls: 200,
            },
        });

        await scheduler.tick(NOW);

        const [, , payload] = dispatch.mock.calls[0] as [
            string,
            string,
            Record<string, unknown>,
        ];
        expect(payload).toMatchObject({ budgetRub: 100, maxCalls: 200 });
        expect(nightlyLimitNote(100, 200)).toBe(
            'лимит 100 ₽ и 200 звонков за ночь',
        );
        expect(nightlyLimitNote(0, 200)).toBe('лимит 200 звонков за ночь');
        expect(nightlyLimitNote(100, 0)).toBe('лимит 100 ₽ за ночь');
    });
});
