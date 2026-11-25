import { buildReportDonePayload } from '../cache/report-done-payload.util';

const NOW = new Date(2026, 10, 25, 12, 0); // 25.11.2026

describe('buildReportDonePayload', () => {
    it('закрытый период: данные, requestKey, generatedAt = now и closedPeriod true', () => {
        const payload = buildReportDonePayload(
            '2026-10-01|2026-10-31|1',
            [{ id: 1 }],
            '2026-10-31',
            NOW,
        );

        expect(payload).toEqual({
            requestKey: '2026-10-01|2026-10-31|1',
            data: [{ id: 1 }],
            generatedAt: NOW.toISOString(),
            closedPeriod: true,
        });
    });

    it('открытый период (задевает текущий месяц): closedPeriod false', () => {
        const payload = buildReportDonePayload(
            '2026-11-01|2026-11-25|1',
            [],
            '2026-11-25',
            NOW,
        );

        expect(payload.closedPeriod).toBe(false);
        expect(payload.generatedAt).toBe(NOW.toISOString());
    });
});
