import {
    AGENT_ANALYSIS_TYPE,
    CALL_CLASSIFY_TYPE,
} from '@lib/call-lib/ai/ai-record-types.const';
import {
    AuditAiRow,
    AuditDb,
    AuditTranscriptionRow,
} from '../audit/ai-analytics-audit.load';
import { runAiAnalyticsAudit } from '../audit/ai-analytics-audit.run';

/** Пятница 04.09.2026 12:00 МСК. */
const NOW = new Date('2026-09-04T09:00:00Z');

function transcription(
    id: number,
    userId: string | null,
    startedAt: string,
    duration = '420',
): AuditTranscriptionRow {
    return {
        id: BigInt(id),
        userId,
        duration,
        callStartedAt: new Date(startedAt),
        createdAt: new Date(startedAt),
    };
}

function analysis(id: number, transcriptionId: number): AuditAiRow {
    return {
        id: BigInt(id),
        transcriptionId: BigInt(transcriptionId),
        type: AGENT_ANALYSIS_TYPE,
        result: null,
        userResult: {
            callType: 'presentation',
            versions: { promptVersion: 'p1' },
            nextStep: { set: true, date: '2026-09-05' },
        },
    };
}

function makeDb(
    transcriptions: AuditTranscriptionRow[],
    aiRows: AuditAiRow[],
): AuditDb & { calls: jest.Mock[] } {
    const findDoneTranscriptions = jest.fn().mockResolvedValue(transcriptions);
    const findAiRecords = jest.fn().mockResolvedValue(aiRows);
    const aiDepth = jest.fn((_domain: string, type: string) =>
        Promise.resolve({
            type,
            firstCreatedAt: new Date('2026-03-01T00:00:00Z'),
            count: aiRows.filter(row => row.type === type).length,
        }),
    );
    return {
        findDoneTranscriptions,
        findAiRecords,
        aiDepth,
        calls: [findDoneTranscriptions, findAiRecords, aiDepth],
    };
}

describe('runAiAnalyticsAudit (оркестратор аудита)', () => {
    it('окно месяцев от now, выборка через AuditDb, отчёт и markdown с разделами', async () => {
        const db = makeDb(
            [
                transcription(1, '10', '2026-09-01T07:00:00Z'),
                transcription(2, '10', '2026-08-15T07:00:00Z', '120'),
                transcription(3, null, '2026-07-20T07:00:00Z'),
                // Вне окна 3 месяцев — считается outsideWindow.
                transcription(4, '20', '2026-05-20T07:00:00Z'),
            ],
            [analysis(100, 1), analysis(101, 2)],
        );

        const result = await runAiAnalyticsAudit(db, {
            domain: 'april.bitrix24.ru',
            months: 3,
            timeZone: 'Europe/Moscow',
            now: NOW,
        });

        expect(result.generatedAt).toBe('2026-09-04T09:00:00.000Z');
        expect(result.report.meta).toEqual({
            domain: 'april.bitrix24.ru',
            timeZone: 'Europe/Moscow',
            months: ['2026-07', '2026-08', '2026-09'],
            generatedAt: '2026-09-04',
        });
        expect(result.report.totals).toMatchObject({
            fetchedTranscriptions: 4,
            outsideWindow: 1,
            calls: 3,
            withManager: 2,
            analyzed: 2,
        });
        // Глубина — по обоим типам ais аудита.
        expect(result.report.depth.map(row => row.type).sort()).toEqual(
            [AGENT_ANALYSIS_TYPE, CALL_CLASSIFY_TYPE].sort(),
        );

        const [findDone, , aiDepth] = db.calls;
        expect(findDone).toHaveBeenCalledWith(
            'april.bitrix24.ru',
            // Начало 2026-07 (UTC) минус сутки запаса.
            new Date('2026-06-30T00:00:00Z'),
        );
        expect(aiDepth).toHaveBeenCalledTimes(2);

        for (const heading of [
            '# Аудит данных AI-аналитики',
            '## 1. Покрытие user_id в transcriptions по месяцам',
            '## 2. Разборы по (менеджер × тип × месяц)',
            '## 3. Доля other / irrelevant по месяцам',
            '## 4. Длительности',
            '## 5. Разборы по версиям',
            '## 6. Заполненность полей user_result',
            '## 7. Глубина истории ais',
            '## 8. Рекомендация по порогам 4.11 и minDurationSec',
        ]) {
            expect(result.markdown).toContain(heading);
        }
    });

    it('generatedAt — ISO момента запуска, дата отчёта — в TZ портала', async () => {
        const db = makeDb([], []);
        // 31.08 23:30 UTC = 01.09 02:30 МСК → месяц окна и дата уже сентябрьские.
        const now = new Date('2026-08-31T23:30:00Z');
        const result = await runAiAnalyticsAudit(db, {
            domain: 'd',
            months: 1,
            timeZone: 'Europe/Moscow',
            now,
        });
        expect(result.generatedAt).toBe(now.toISOString());
        expect(new Date(result.generatedAt).getTime()).toBe(now.getTime());
        expect(result.report.meta.generatedAt).toBe('2026-09-01');
        expect(result.report.meta.months).toEqual(['2026-09']);
        expect(result.report.totals.calls).toBe(0);
    });

    it('ошибка источника данных пробрасывается наружу', async () => {
        const db = makeDb([], []);
        db.calls[0].mockRejectedValueOnce(new Error('db down'));
        await expect(
            runAiAnalyticsAudit(db, {
                domain: 'd',
                months: 1,
                timeZone: 'Europe/Moscow',
                now: NOW,
            }),
        ).rejects.toThrow('db down');
    });
});
