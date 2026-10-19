import {
    isReanalysisRunStatusLike,
    REANALYSIS_DEFAULTS,
    reanalysisRunKey,
    reanalyzeJobId,
    versionAgreementKey,
} from '../contracts/reanalysis.types';

/**
 * Контракт переразбора истории: ключи записей и jobId частей — один
 * источник для админ-ручки (ставит часть 1) и воркера (ставит продолжения).
 */
describe('контракт переразбора истории', () => {
    it('jobId несёт домен, период, режим и номер части', () => {
        expect(
            reanalyzeJobId({
                domain: 'gsr.bitrix24.ru',
                from: '2026-09-01',
                to: '2026-10-19',
                dryRun: true,
            }),
        ).toBe(
            'call-report-reanalyze:gsr.bitrix24.ru:2026-09-01:2026-10-19:dry-run:part-1',
        );
        expect(
            reanalyzeJobId({
                domain: 'gsr.bitrix24.ru',
                from: '2026-09-01',
                to: '2026-10-19',
                part: 3,
            }),
        ).toBe(
            'call-report-reanalyze:gsr.bitrix24.ru:2026-09-01:2026-10-19:run:part-3',
        );
    });

    it('ключи записей: статус — период, отчёт — старая серия → версия (без серии — none)', () => {
        expect(reanalysisRunKey('2026-09-01', '2026-10-19')).toBe(
            '2026-09-01..2026-10-19',
        );
        expect(versionAgreementKey('2026-09-08', 'focus-v2.4-2026-10-20')).toBe(
            '2026-09-08->focus-v2.4-2026-10-20',
        );
        expect(versionAgreementKey(null, 'v')).toBe('none->v');
    });

    it('бюджет времени части — 45 минут, таймаут джобы больше бюджета', () => {
        expect(REANALYSIS_DEFAULTS.timeBudgetMs).toBe(45 * 60 * 1000);
    });

    it('структурная проверка статуса прогона', () => {
        expect(
            isReanalysisRunStatusLike({
                domain: 'd',
                from: 'f',
                to: 't',
                candidates: 1,
                done: 0,
                failed: 0,
                skipped: 0,
                finished: false,
                startedAt: 'x',
                updatedAt: 'y',
            }),
        ).toBe(true);
        expect(isReanalysisRunStatusLike({ domain: 'd' })).toBe(false);
        expect(isReanalysisRunStatusLike('нет')).toBe(false);
    });
});
