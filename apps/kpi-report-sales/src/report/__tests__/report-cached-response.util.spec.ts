import { toCachedReportResponse } from '../cache/report-cached-response.util';
import type { ReportResultEnvelope } from '../cache/report-result-cache.service';

const NOW = new Date(2026, 10, 25, 12, 0); // 25.11.2026

describe('toCachedReportResponse', () => {
    const REQUEST_KEY = '2026-10-01|2026-10-31|1';

    it('промах кэша (null) → null: контроллер ставит job', () => {
        expect(
            toCachedReportResponse(null, REQUEST_KEY, '2026-10-31', NOW),
        ).toBeNull();
    });

    it('ready-конверт → данные, дата расчёта из конверта и closedPeriod', () => {
        const envelope: ReportResultEnvelope<number[]> = {
            status: 'ready',
            data: [1, 2],
            generatedAt: '2026-11-12T07:40:12.000Z',
        };

        expect(
            toCachedReportResponse(envelope, REQUEST_KEY, '2026-10-31', NOW),
        ).toEqual({
            status: 'ready',
            data: [1, 2],
            requestKey: REQUEST_KEY,
            generatedAt: '2026-11-12T07:40:12.000Z',
            closedPeriod: true,
        });
    });

    it('ready-конверт открытого периода → closedPeriod false', () => {
        const envelope: ReportResultEnvelope<number[]> = {
            status: 'ready',
            data: [],
            generatedAt: '2026-11-25T09:00:00.000Z',
        };

        expect(
            toCachedReportResponse(envelope, REQUEST_KEY, '2026-11-25', NOW),
        ).toMatchObject({ status: 'ready', closedPeriod: false });
    });

    it('error-конверт → status error с message, без generatedAt/closedPeriod', () => {
        const envelope: ReportResultEnvelope<number[]> = {
            status: 'error',
            message: 'Битрикс не вернул команды',
            generatedAt: '2026-11-25T09:00:00.000Z',
        };

        expect(
            toCachedReportResponse(envelope, REQUEST_KEY, '2026-10-31', NOW),
        ).toEqual({
            status: 'error',
            message: 'Битрикс не вернул команды',
            requestKey: REQUEST_KEY,
        });
    });
});
