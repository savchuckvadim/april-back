import {
    factsCatchupJobId,
    factsCatchupRunKey,
    isFactsCatchupRunStatusLike,
} from '../facts-catchup.types';

describe('facts-catchup.types', () => {
    it('ключ записи статуса — период дат портала', () => {
        expect(factsCatchupRunKey('2026-10-01', '2026-10-31')).toBe(
            '2026-10-01..2026-10-31',
        );
    });

    it('jobId несёт домен, период, режим и номер части', () => {
        const base = {
            domain: 'gsr.bitrix24.ru',
            from: '2026-10-01',
            to: '2026-10-31',
        };

        expect(factsCatchupJobId({ ...base, dryRun: true })).toBe(
            'call-report-facts-catchup:gsr.bitrix24.ru:2026-10-01:2026-10-31:dry-run:part-1',
        );
        expect(factsCatchupJobId({ ...base, part: 3 })).toBe(
            'call-report-facts-catchup:gsr.bitrix24.ru:2026-10-01:2026-10-31:run:part-3',
        );
    });

    it('структурная проверка статуса: нужны период, версия, счётчики и даты', () => {
        const status = {
            domain: 'gsr.bitrix24.ru',
            from: '2026-10-01',
            to: '2026-10-31',
            promptVersion: 'facts-v1-2026-11-10',
            candidates: 1,
            done: 0,
            failed: 0,
            finished: false,
            startedAt: '2026-11-10T06:00:00.000Z',
            updatedAt: '2026-11-10T06:00:00.000Z',
        };

        expect(isFactsCatchupRunStatusLike(status)).toBe(true);
        expect(
            isFactsCatchupRunStatusLike({
                ...status,
                promptVersion: undefined,
            }),
        ).toBe(false);
        expect(isFactsCatchupRunStatusLike(null)).toBe(false);
        expect(isFactsCatchupRunStatusLike([status])).toBe(false);
    });
});
