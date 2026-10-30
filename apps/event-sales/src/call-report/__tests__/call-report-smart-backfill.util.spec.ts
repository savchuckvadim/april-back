import type { AiSmartWriteCandidateView } from '@lib/call-lib';
import type { SmartBackfillJobData } from '@lib/sales-ai-analytics';
import {
    initialSmartBackfillStatus,
    selectSmartBackfillCandidates,
    skippedTotal,
    toSmartBackfillResult,
} from '../use-cases/call-report-smart-backfill.util';

const WINDOW = {
    from: '2026-10-13',
    to: '2026-10-30',
    timeZone: 'Europe/Moscow',
};

const record = (
    id: string,
    over: Partial<AiSmartWriteCandidateView> = {},
): AiSmartWriteCandidateView => ({
    id,
    transcription_id: `t-${id}`,
    report_item_id: `${Number(id) * 100}`,
    in_report: true,
    status: 'done',
    created_at: new Date('2026-10-20T10:00:00.000Z'),
    ...over,
});

const DATA: SmartBackfillJobData = {
    domain: 'g.bitrix24.ru',
    mode: 'period',
    from: '2026-10-13',
    to: '2026-10-30',
    source: 'admin',
};

/**
 * Отбор кандидатов: окно по дню записи в поясе портала, одна активная
 * запись на транскрипцию, без элемента — пропуск; статус части с переносом
 * счётчиков у продолжений.
 */
describe('selectSmartBackfillCandidates', () => {
    it('берёт активные записи окна с элементом, остальное раскладывает по причинам пропуска', () => {
        const selection = selectSmartBackfillCandidates(
            [
                record('3'),
                record('1'),
                // Запись той же транскрипции, замещённая переразбором.
                record('4', { transcription_id: 't-1', status: 'superseded' }),
                // Элемента смарта нет.
                record('5', { report_item_id: null }),
                // За окном: 12.10 по Москве (запас выборки в сутки).
                record('6', {
                    created_at: new Date('2026-10-12T20:59:00.000Z'),
                }),
                // 31.10 по Москве (21:30 UTC 30.10) — тоже за окном.
                record('7', {
                    created_at: new Date('2026-10-30T21:30:00.000Z'),
                }),
                // Без транскрипции — сама по себе.
                record('8', { transcription_id: null }),
            ],
            WINDOW,
        );
        expect(selection.candidates.map(candidate => candidate.id)).toEqual([
            '1',
            '3',
            '8',
        ]);
        expect(selection.candidates[0]).toEqual({
            id: '1',
            transcriptionId: 't-1',
            reportItemId: '100',
        });
        expect(selection.skippedBy).toEqual({
            noSmartItem: 1,
            superseded: 1,
            noPayload: 0,
        });
        expect(skippedTotal(selection.skippedBy)).toBe(2);
    });

    it('все записи транскрипции замещены — все в superseded, кандидата нет', () => {
        const selection = selectSmartBackfillCandidates(
            [
                record('1', { status: 'superseded' }),
                record('2', { transcription_id: 't-1', status: 'superseded' }),
            ],
            WINDOW,
        );
        expect(selection.candidates).toEqual([]);
        expect(selection.skippedBy.superseded).toBe(2);
    });
});

describe('initialSmartBackfillStatus / toSmartBackfillResult', () => {
    const selection = selectSmartBackfillCandidates(
        [record('1'), record('2'), record('3', { report_item_id: null })],
        WINDOW,
    );
    const now = new Date('2026-10-30T09:00:00.000Z');

    it('часть 1: кандидаты = записи окна (с пропусками), счётчики с нуля', () => {
        const status = initialSmartBackfillStatus({
            data: DATA,
            selection,
            previous: null,
            now,
        });
        expect(status).toMatchObject({
            mode: 'period',
            source: 'admin',
            part: 1,
            candidates: 3,
            done: 0,
            skipped: 1,
            skippedBy: { noSmartItem: 1, superseded: 0, noPayload: 0 },
            startedAt: now.toISOString(),
            finished: false,
            continuedWith: null,
        });
    });

    it('часть 2 незаконченного боевого прогона того же режима переносит счётчики и начало', () => {
        const previous = initialSmartBackfillStatus({
            data: DATA,
            selection,
            previous: null,
            now: new Date('2026-10-30T08:00:00.000Z'),
        });
        previous.done = 2;
        previous.failed = 1;
        previous.lastError = 'boom';
        const status = initialSmartBackfillStatus({
            data: { ...DATA, part: 2, offset: 2 },
            selection,
            previous,
            now,
        });
        expect(status).toMatchObject({
            part: 2,
            candidates: 3,
            done: 2,
            failed: 1,
            lastError: 'boom',
            startedAt: '2026-10-30T08:00:00.000Z',
            updatedAt: now.toISOString(),
        });
        // Законченный или dryRun-прогон не продолжается — счётчики заново.
        const fresh = initialSmartBackfillStatus({
            data: { ...DATA, part: 2 },
            selection,
            previous: { ...previous, finished: true },
            now,
        });
        expect(fresh.done).toBe(0);
    });

    it('итог джобы собирается из статуса и числа обработанных', () => {
        const status = initialSmartBackfillStatus({
            data: DATA,
            selection,
            previous: null,
            now,
        });
        status.done = 2;
        const result = toSmartBackfillResult(status, 2, 's-1', Date.now());
        expect(result).toMatchObject({
            domain: 'g.bitrix24.ru',
            mode: 'period',
            processed: 2,
            done: 2,
            statusId: 's-1',
        });
        expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });
});
