import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import {
    accountOutcome,
    dayKeyInWindow,
    etaMinutesOf,
    initialRunStatus,
    isInRoster,
    selectReanalysisCandidates,
    windowBounds,
    type ReanalysisCandidate,
    type ReanalysisSelection,
} from '../use-cases/call-report-reanalyze.util';
import { versionSeriesDate } from '@lib/sales-ai-analytics';

/**
 * Отбор кандидатов переразбора: другая ВЕРСИЯ промпта (в том числе той же
 * серии) → кандидат; текущая версия → пропуск; без разбора → пропуск; не
 * пилот → пропуск; явный userIds перекрывает пилот; окно дат — по дням в
 * поясе портала.
 */
const CURRENT_SERIES = versionSeriesDate(CALL_REPORT_PROMPT_VERSION);
/** v2.2 — старая версия промпта. */
const OLD_VERSION = 'focus-v2.2-2026-09-08';
/** v2.3 — предыдущая версия той же серии: тоже пересчитывается. */
const PREVIOUS_VERSION = 'focus-v2.3-2026-09-25';

const row = (id: string, userId: string | null) => ({
    id,
    userId,
    callStartedAt: new Date('2026-09-10T10:00:00Z'),
    createdAt: new Date('2026-09-10T10:30:00Z'),
});

const record = (
    id: string,
    transcriptionId: string,
    prompt: string | null,
    status = 'done',
) => ({
    id,
    type: 'agent-analysis',
    status,
    transcription_id: transcriptionId,
    user_result: {
        callType: 'presentation',
        weightedScore: 70,
        ...(prompt === null ? {} : { versions: { prompt } }),
    },
});

describe('selectReanalysisCandidates', () => {
    it('другая версия (и той же серии) и разбор без версий — кандидаты; текущая версия, без разбора и не пилот — пропуски', () => {
        const selection = selectReanalysisCandidates({
            transcriptions: [
                row('t-1', '317'),
                row('t-2', '317'),
                row('t-3', '317'),
                row('t-4', '999'),
                row('t-5', '317'),
                row('t-6', '317'),
            ],
            records: [
                record('1', 't-1', OLD_VERSION),
                record('2', 't-2', PREVIOUS_VERSION),
                record('4', 't-4', OLD_VERSION),
                record('5', 't-5', null),
                record('6', 't-6', CALL_REPORT_PROMPT_VERSION),
            ],
            currentPromptVersion: CALL_REPORT_PROMPT_VERSION,
            roster: [317],
        });

        expect(selection.candidates.map(c => c.transcriptionId)).toEqual([
            't-1',
            't-2',
            't-5',
        ]);
        expect(selection.candidates[0]).toMatchObject({
            oldPromptVersion: OLD_VERSION,
            oldSeries: versionSeriesDate(OLD_VERSION),
            old: { id: '1' },
        });
        expect(selection.candidates[1]).toMatchObject({
            oldPromptVersion: PREVIOUS_VERSION,
            oldSeries: CURRENT_SERIES,
        });
        expect(selection.candidates[2]).toMatchObject({
            oldPromptVersion: null,
            oldSeries: null,
        });
        expect(selection.skippedBy).toEqual({
            upToDate: 1,
            noAnalysis: 1,
            notInRoster: 1,
            noActive: 0,
        });
    });

    it('повтор запуска безопасен: активная запись текущей версии поверх superseded старой — пропуск; только superseded — noActive', () => {
        const selection = selectReanalysisCandidates({
            transcriptions: [row('t-1', '317'), row('t-2', '317')],
            records: [
                record('1', 't-1', OLD_VERSION, 'superseded'),
                record('9', 't-1', CALL_REPORT_PROMPT_VERSION),
                record('2', 't-2', OLD_VERSION, 'superseded'),
            ],
            currentPromptVersion: CALL_REPORT_PROMPT_VERSION,
            roster: null,
        });

        expect(selection.candidates).toEqual([]);
        expect(selection.skippedBy).toMatchObject({ upToDate: 1, noActive: 1 });
    });

    it('список null — все сотрудники, в том числе без владельца; явный список отсекает остальных', () => {
        expect(isInRoster(null, null)).toBe(true);
        expect(isInRoster('317', [317])).toBe(true);
        expect(isInRoster('999', [317])).toBe(false);
        expect(isInRoster(null, [317])).toBe(false);
    });
});

describe('окно дат портала', () => {
    it('день считается в поясе портала: 23:30 UTC 30 сентября — уже 1 октября по Москве', () => {
        const late = new Date('2026-09-30T23:30:00Z');
        expect(
            dayKeyInWindow(late, '2026-09-01', '2026-09-30', 'Europe/Moscow'),
        ).toBe(false);
        expect(dayKeyInWindow(late, '2026-09-01', '2026-09-30', 'UTC')).toBe(
            true,
        );
        expect(dayKeyInWindow(null, '2026-09-01', '2026-09-30', 'UTC')).toBe(
            false,
        );
    });

    it('границы выборки из БД шире периода на сутки с каждой стороны', () => {
        const bounds = windowBounds('2026-09-01', '2026-09-30');
        expect(bounds.from.toISOString()).toBe('2026-08-31T00:00:00.000Z');
        expect(bounds.to.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    });
});

describe('initialRunStatus', () => {
    const versions = {
        prompt: CALL_REPORT_PROMPT_VERSION,
        rubric: 'r',
        registry: 'x',
        attribution: 'a',
        classifier: 'c',
    };
    const selection: ReanalysisSelection = {
        candidates: [],
        skippedBy: { upToDate: 2, noAnalysis: 1, notInRoster: 0, noActive: 0 },
    };
    const data = { domain: 'd', from: '2026-09-01', to: '2026-09-30' };
    const now = new Date('2026-10-20T01:00:00Z');

    it('новая часть 1 — счётчики с нуля, пропуски суммируются', () => {
        const status = initialRunStatus({
            data,
            versions,
            roster: [317],
            selection,
            previous: null,
            now,
        });
        expect(status).toMatchObject({
            part: 1,
            done: 0,
            skipped: 3,
            userIds: [317],
            series: CURRENT_SERIES,
            startedAt: now.toISOString(),
            finished: false,
        });
    });

    it('продолжение незаконченного прогона той же версии несёт счётчики дальше', () => {
        const previous = initialRunStatus({
            data,
            versions,
            roster: null,
            selection,
            previous: null,
            now: new Date('2026-10-20T00:00:00Z'),
        });
        previous.done = 5;
        previous.tokens = 100;
        previous.price = 1.5;
        const status = initialRunStatus({
            data: { ...data, part: 2 },
            versions,
            roster: null,
            selection,
            previous,
            now,
        });
        expect(status).toMatchObject({
            part: 2,
            done: 5,
            tokens: 100,
            price: 1.5,
            startedAt: '2026-10-20T00:00:00.000Z',
        });
        // Законченный прошлый прогон не продолжается — счётчики с нуля.
        const fresh = initialRunStatus({
            data: { ...data, part: 2 },
            versions,
            roster: null,
            selection,
            previous: { ...previous, finished: true },
            now,
        });
        expect(fresh.done).toBe(0);
        expect(fresh.part).toBe(2);
    });

    it('перезапуск «части 1» поверх незаконченного прогона продолжает его: счётчики и время идут дальше, номер части растёт, total = сделано + остаток', () => {
        const candidate = (id: string): ReanalysisCandidate => ({
            transcriptionId: id,
            userId: '317',
            old: record(`r-${id}`, id, OLD_VERSION),
            oldPromptVersion: OLD_VERSION,
            oldSeries: '2026-09-08',
        });
        const previous = initialRunStatus({
            data,
            versions,
            roster: null,
            selection,
            previous: null,
            now: new Date('2026-10-20T00:00:00Z'),
        });
        previous.part = 3;
        previous.done = 5;
        previous.failed = 1;
        previous.processingMs = 60_000;
        const status = initialRunStatus({
            data: { ...data, part: 1 },
            versions,
            roster: null,
            selection: {
                candidates: ['a', 'b', 'c'].map(candidate),
                skippedBy: selection.skippedBy,
            },
            previous,
            now,
        });
        expect(status).toMatchObject({
            part: 4,
            done: 5,
            failed: 1,
            processingMs: 60_000,
            total: 8,
            concurrency: 3,
            etaMinutes: null,
            startedAt: '2026-10-20T00:00:00.000Z',
        });
    });

    it('dryRun ничего не продолжает: поверх незаконченного боевого прогона счётчики с нуля', () => {
        const previous = initialRunStatus({
            data,
            versions,
            roster: null,
            selection,
            previous: null,
            now: new Date('2026-10-20T00:00:00Z'),
        });
        previous.done = 5;
        previous.price = 7.5;
        previous.part = 2;
        const dry = initialRunStatus({
            data: { ...data, dryRun: true },
            versions,
            roster: null,
            selection,
            previous,
            now,
        });
        expect(dry).toMatchObject({
            part: 1,
            dryRun: true,
            done: 0,
            price: 0,
            processingMs: 0,
            stopped: false,
            startedAt: now.toISOString(),
        });
    });

    it('etaMinutesOf: остаток × среднее время звонка ÷ одновременность; без обработанных — null', () => {
        expect(
            etaMinutesOf({
                total: 100,
                done: 10,
                failed: 0,
                processingMs: 10 * 30_000,
                concurrency: 3,
            }),
        ).toBe(15);
        expect(
            etaMinutesOf({
                total: 100,
                done: 10,
                failed: 0,
                processingMs: 10 * 30_000,
                concurrency: 1,
            }),
        ).toBe(45);
        expect(
            etaMinutesOf({
                total: 100,
                done: 0,
                failed: 0,
                processingMs: 0,
                concurrency: 3,
            }),
        ).toBeNull();
    });

    it('accountOutcome: успех — счётчики и расход; сбой — lastError, при остановке — с причиной', () => {
        const status = initialRunStatus({
            data,
            versions,
            roster: null,
            selection,
            previous: null,
            now,
        });
        status.total = 10;
        const pool = {
            processed: 1,
            doneInPart: 1,
            failStreak: 0,
            concurrency: 3,
            stopped: false,
            aborted: false,
            timeBudgetHit: false,
    budgetHit: false,
        };
        accountOutcome(
            status,
            { ok: true, usage: { tokens_count: 1200, price: 1.8 } },
            30_000,
            pool,
        );
        expect(status).toMatchObject({
            done: 1,
            tokens: 1200,
            price: 1.8,
            processingMs: 30_000,
            concurrency: 3,
            etaMinutes: 2,
        });

        accountOutcome(status, { ok: false, error: 'модель упала' }, 5_000, {
            ...pool,
            processed: 2,
            failStreak: 1,
        });
        expect(status).toMatchObject({ failed: 1, lastError: 'модель упала' });

        accountOutcome(status, { ok: false, error: 'модель упала' }, 5_000, {
            ...pool,
            processed: 3,
            failStreak: 8,
            concurrency: 1,
            stopped: true,
        });
        expect(status.lastError).toBe(
            'модель упала — остановлено после 8 сбоев подряд',
        );
        expect(status.concurrency).toBe(1);
    });
});
