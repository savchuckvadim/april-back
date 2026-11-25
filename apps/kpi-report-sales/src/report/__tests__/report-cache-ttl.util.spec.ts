import {
    isClosedReportPeriod,
    reportResultTtlSeconds,
} from '../cache/report-cache-ttl.util';
import {
    KPI_CLOSED_PERIOD_TTL_SECONDS,
    KPI_RESULT_TTL_SECONDS,
} from '../constants/report-queue.const';

/** «Сейчас» задаём локальными компонентами — как читает дату сервер. */
const NOW = new Date(2026, 10, 25, 12, 0); // 25.11.2026

describe('isClosedReportPeriod', () => {
    it('период кончается сегодня — открыт', () => {
        expect(isClosedReportPeriod('2026-11-25', NOW)).toBe(false);
    });

    it('период кончается в будущем — открыт', () => {
        expect(isClosedReportPeriod('2026-12-31', NOW)).toBe(false);
        expect(isClosedReportPeriod('2027-03-15', NOW)).toBe(false);
    });

    it('период кончается первым днём текущего месяца — открыт', () => {
        expect(isClosedReportPeriod('2026-11-01', NOW)).toBe(false);
    });

    it('период кончается последним днём прошлого месяца — закрыт', () => {
        expect(isClosedReportPeriod('2026-10-31', NOW)).toBe(true);
    });

    it('период давно в прошлом — закрыт', () => {
        expect(isClosedReportPeriod('2025-01-31', NOW)).toBe(true);
    });

    it('граница года: сейчас январь, период кончается 31 декабря — закрыт', () => {
        const january = new Date(2027, 0, 15, 10, 0);

        expect(isClosedReportPeriod('2026-12-31', january)).toBe(true);
        expect(isClosedReportPeriod('2027-01-01', january)).toBe(false);
    });

    it('первое число месяца, 00:05: прошлый месяц уже закрыт', () => {
        const firstOfMonth = new Date(2026, 10, 1, 0, 5);

        expect(isClosedReportPeriod('2026-10-31', firstOfMonth)).toBe(true);
        expect(isClosedReportPeriod('2026-11-01', firstOfMonth)).toBe(false);
    });

    it('последний день месяца, 23:59: текущий месяц ещё открыт', () => {
        const endOfMonth = new Date(2026, 10, 30, 23, 59);

        expect(isClosedReportPeriod('2026-10-31', endOfMonth)).toBe(true);
        expect(isClosedReportPeriod('2026-11-30', endOfMonth)).toBe(false);
    });
});

describe('reportResultTtlSeconds', () => {
    it('закрытый период — долгий TTL (180 суток)', () => {
        expect(reportResultTtlSeconds('2026-10-31', NOW)).toBe(
            KPI_CLOSED_PERIOD_TTL_SECONDS,
        );
        expect(KPI_CLOSED_PERIOD_TTL_SECONDS).toBe(180 * 24 * 3600);
    });

    it('открытый период — транспортный буфер 180 секунд', () => {
        expect(reportResultTtlSeconds('2026-11-25', NOW)).toBe(
            KPI_RESULT_TTL_SECONDS,
        );
        expect(KPI_RESULT_TTL_SECONDS).toBe(180);
    });
});
