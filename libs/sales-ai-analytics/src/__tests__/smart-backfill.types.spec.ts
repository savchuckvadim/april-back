import {
    emptySmartBackfillSkips,
    isSmartBackfillRunStatusLike,
    SMART_BACKFILL_DEFAULTS,
    smartBackfillJobId,
    smartBackfillLookbackWindow,
    smartBackfillRunKey,
} from '../contracts/smart-backfill.types';

/**
 * Контракт дописывания полей карточек: ключи записей, jobId частей и окно
 * крона — один источник для админ-ручки, крона и воркера.
 */
describe('контракт дописывания полей карточек', () => {
    it('jobId несёт домен, режим, период, dryRun и номер части', () => {
        expect(
            smartBackfillJobId({
                domain: 'g.bitrix24.ru',
                mode: 'period',
                from: '2026-10-13',
                to: '2026-10-30',
                dryRun: true,
            }),
        ).toBe(
            'call-report-smart-backfill:g.bitrix24.ru:period:2026-10-13:2026-10-30:dry-run:part-1',
        );
        expect(
            smartBackfillJobId({
                domain: 'g.bitrix24.ru',
                mode: 'pending',
                from: '2026-10-01',
                to: '2026-10-31',
                part: 2,
            }),
        ).toBe(
            'call-report-smart-backfill:g.bitrix24.ru:pending:2026-10-01:2026-10-31:run:part-2',
        );
    });

    it('ключ записи статуса — режим и период', () => {
        expect(smartBackfillRunKey('period', '2026-10-13', '2026-10-30')).toBe(
            'period:2026-10-13..2026-10-30',
        );
    });

    it('окно «последние N дней» считается датами портала по сегодня включительно', () => {
        // 22:30 UTC 30.10 — в Москве уже 31.10 01:30.
        const now = new Date('2026-10-30T22:30:00.000Z');
        expect(
            smartBackfillLookbackWindow(
                now,
                SMART_BACKFILL_DEFAULTS.pendingLookbackDays,
                'Europe/Moscow',
            ),
        ).toEqual({ from: '2026-10-01', to: '2026-10-31' });
        expect(smartBackfillLookbackWindow(now, 30, 'UTC')).toEqual({
            from: '2026-09-30',
            to: '2026-10-30',
        });
    });

    it('проверка формы статуса: без режима, счётчиков или дат — чужая запись', () => {
        const status = {
            domain: 'g.bitrix24.ru',
            mode: 'period',
            from: '2026-10-13',
            to: '2026-10-30',
            dryRun: false,
            source: 'admin',
            part: 1,
            candidates: 5,
            done: 4,
            failed: 1,
            missing: 0,
            skipped: 0,
            skippedBy: emptySmartBackfillSkips(),
            startedAt: '2026-10-30T09:00:00.000Z',
            updatedAt: '2026-10-30T09:10:00.000Z',
            finished: true,
            lastError: null,
            timeBudgetHit: false,
            continuedWith: null,
        };
        expect(isSmartBackfillRunStatusLike(status)).toBe(true);
        expect(isSmartBackfillRunStatusLike({ ...status, mode: 'all' })).toBe(
            false,
        );
        expect(isSmartBackfillRunStatusLike({ ...status, done: '4' })).toBe(
            false,
        );
        expect(isSmartBackfillRunStatusLike(null)).toBe(false);
        expect(isSmartBackfillRunStatusLike([])).toBe(false);
    });

    it('пустые пропуски — по нулю на каждую причину', () => {
        expect(emptySmartBackfillSkips()).toEqual({
            noSmartItem: 0,
            superseded: 0,
            noPayload: 0,
        });
    });
});
