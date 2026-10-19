import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import {
    dayKeyInWindow,
    initialRunStatus,
    isInRoster,
    selectReanalysisCandidates,
    windowBounds,
    type ReanalysisSelection,
} from '../use-cases/call-report-reanalyze.util';
import { versionSeriesDate } from '@lib/sales-ai-analytics';

/**
 * Отбор кандидатов переразбора: чужая серия промпта → кандидат; текущая
 * серия → пропуск; без разбора → пропуск; не пилот → пропуск; явный
 * userIds перекрывает пилот; окно дат — по дням в поясе портала.
 */
const CURRENT_SERIES = versionSeriesDate(CALL_REPORT_PROMPT_VERSION);
/** v2.2 — другая серия (разрыв ряда). */
const OLD_VERSION = 'focus-v2.2-2026-09-08';
/** v2.3 — та же серия, что у текущей v2.4 (минорная правка). */
const SAME_SERIES_VERSION = 'focus-v2.3-2026-09-25';

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
    it('чужая серия и разбор без версий — кандидаты; текущая серия, без разбора и не пилот — пропуски', () => {
        const selection = selectReanalysisCandidates({
            transcriptions: [
                row('t-1', '317'),
                row('t-2', '317'),
                row('t-3', '317'),
                row('t-4', '999'),
                row('t-5', '317'),
            ],
            records: [
                record('1', 't-1', OLD_VERSION),
                record('2', 't-2', SAME_SERIES_VERSION),
                record('4', 't-4', OLD_VERSION),
                record('5', 't-5', null),
            ],
            currentSeries: CURRENT_SERIES,
            roster: [317],
        });

        expect(selection.candidates.map(c => c.transcriptionId)).toEqual([
            't-1',
            't-5',
        ]);
        expect(selection.candidates[0]).toMatchObject({
            oldPromptVersion: OLD_VERSION,
            oldSeries: '2026-09-08',
            old: { id: '1' },
        });
        expect(selection.candidates[1]).toMatchObject({
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

    it('повтор запуска безопасен: активная запись текущей серии поверх superseded старой — пропуск; только superseded — noActive', () => {
        const selection = selectReanalysisCandidates({
            transcriptions: [row('t-1', '317'), row('t-2', '317')],
            records: [
                record('1', 't-1', OLD_VERSION, 'superseded'),
                record('9', 't-1', CALL_REPORT_PROMPT_VERSION),
                record('2', 't-2', OLD_VERSION, 'superseded'),
            ],
            currentSeries: CURRENT_SERIES,
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
    });
});
