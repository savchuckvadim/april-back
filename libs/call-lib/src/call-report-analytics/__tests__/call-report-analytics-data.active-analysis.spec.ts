import { CallReportAnalyticsDataService } from '../services/call-report-analytics-data.service';
import { CallReportAnalyticsQueryDto } from '../dto/call-report-analytics-query.dto';

/**
 * После переразбора у звонка две записи agent-analysis: выборка берёт
 * АКТИВНУЮ (не superseded, с наибольшим id), а не первую попавшуюся.
 */
const QUERY: CallReportAnalyticsQueryDto = {
    domain: 'test.bitrix24.ru',
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.000Z',
};

const liteRow = {
    id: 't-1',
    domain: QUERY.domain,
    callStartedAt: new Date('2026-09-10T10:00:00Z'),
    durationSec: '600',
    entityType: 'deal',
    entityId: '1',
    userId: '317',
    createdAt: new Date('2026-09-10T10:30:00Z'),
};

const record = (
    id: string,
    status: string,
    weightedScore: number,
    callType: string,
) => ({
    id,
    type: 'agent-analysis',
    status,
    transcription_id: 't-1',
    result: '',
    user_result: { callType, weightedScore },
});

const makeService = (ai: unknown[]) => {
    const transcriptionStore = {
        findDoneInPeriod: jest
            .fn()
            .mockResolvedValue([{ ...liteRow, text: 'текст' }]),
        findDoneInPeriodLite: jest.fn().mockResolvedValue([liteRow]),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(ai),
    };
    return new CallReportAnalyticsDataService(
        transcriptionStore as never,
        aiService as never,
    );
};

describe('CallReportAnalyticsDataService: активная запись разбора', () => {
    it('старая superseded + новая активная → берётся новая (в любом порядке выборки)', async () => {
        const old = record('1', 'superseded', 50, 'cold');
        const fresh = record('2', 'done', 80, 'presentation');

        const lite = await makeService([old, fresh]).loadLite(QUERY);
        expect(lite.rows[0]).toMatchObject({
            score: 80,
            callType: 'presentation',
        });

        const reversed = await makeService([fresh, old]).loadLite(QUERY);
        expect(reversed.rows[0]).toMatchObject({
            score: 80,
            callType: 'presentation',
        });

        const full = await makeService([fresh, old]).load(QUERY);
        expect(full.rows[0].analysis).toMatchObject({ weightedScore: 80 });
    });

    it('две активные → с наибольшим числовым id; только superseded → разбора нет', async () => {
        const two = await makeService([
            record('9', 'done', 40, 'cold'),
            record('10', 'done', 90, 'presentation'),
        ]).loadLite(QUERY);
        expect(two.rows[0]).toMatchObject({ score: 90 });

        const none = await makeService([
            record('1', 'superseded', 50, 'cold'),
        ]).loadLite(QUERY);
        expect(none.rows[0]).toMatchObject({
            analysisPresent: false,
            callType: null,
        });
    });
});
