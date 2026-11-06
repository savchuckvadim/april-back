import {
    latestClosedOwnerReportPeriod,
    ownerReportPeriodBounds,
    ownerReportPeriodKey,
    previousOwnerReportPeriod,
} from '../owner-report.period';

describe('периоды отчёта собственнику', () => {
    it('ключ периода по дате', () => {
        expect(ownerReportPeriodKey('month', '2026-10-15')).toBe('2026-10');
        expect(ownerReportPeriodKey('quarter', '2026-10-15')).toBe('2026-Q4');
        expect(ownerReportPeriodKey('half_year', '2026-05-01')).toBe('2026-H1');
        expect(ownerReportPeriodKey('year', '2026-12-31')).toBe('2026');
    });

    it('границы по ключу, чужой ключ — null', () => {
        expect(ownerReportPeriodBounds('month', '2026-02')).toMatchObject({
            from: '2026-02-01',
            to: '2026-02-28',
        });
        expect(ownerReportPeriodBounds('quarter', '2026-Q4')).toMatchObject({
            from: '2026-10-01',
            to: '2026-12-31',
        });
        expect(ownerReportPeriodBounds('half_year', '2026-H2')).toMatchObject({
            from: '2026-07-01',
            to: '2026-12-31',
        });
        expect(ownerReportPeriodBounds('year', '2028')).toMatchObject({
            from: '2028-01-01',
            to: '2028-12-31',
        });
        expect(ownerReportPeriodBounds('month', '2026-Q4')).toBeNull();
        expect(ownerReportPeriodBounds('month', '2026-13')).toBeNull();
    });

    it('прошлый и последний закрытый периоды — через границу года', () => {
        const january = ownerReportPeriodBounds('month', '2026-01');
        expect(january && previousOwnerReportPeriod(january)).toMatchObject({
            periodKey: '2025-12',
            from: '2025-12-01',
            to: '2025-12-31',
        });
        expect(
            latestClosedOwnerReportPeriod('month', '2026-11-06'),
        ).toMatchObject({
            periodKey: '2026-10',
        });
        expect(
            latestClosedOwnerReportPeriod('quarter', '2026-01-10'),
        ).toMatchObject({
            periodKey: '2025-Q4',
            from: '2025-10-01',
        });
        expect(
            latestClosedOwnerReportPeriod('year', '2026-06-01'),
        ).toMatchObject({
            periodKey: '2025',
        });
    });
});
