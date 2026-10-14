import {
    assertIsoDate,
    dayBounds,
    DigestDateError,
    isClosedDay,
    isoToBitrixDate,
    ttlForDigestDay,
} from '../lib/digest-period.util';
import {
    KPI_DIGEST_CLOSED_DAY_TTL_SECONDS,
    KPI_DIGEST_OPEN_DAY_TTL_SECONDS,
} from '../constants/digest.const';

describe('digest-period.util', () => {
    it('assertIsoDate принимает YYYY-MM-DD и отвергает мусор и несуществующие даты', () => {
        expect(assertIsoDate('2026-10-14')).toBe('2026-10-14');
        expect(() => assertIsoDate('14.10.2026')).toThrow(DigestDateError);
        expect(() => assertIsoDate('2026-02-31')).toThrow(DigestDateError);
        expect(() => assertIsoDate('')).toThrow(DigestDateError);
    });

    it('границы дня — DD.MM.YYYY, верхняя эксклюзивна (следующий день)', () => {
        expect(isoToBitrixDate('2026-10-14')).toBe('14.10.2026');
        expect(dayBounds('2026-10-31')).toEqual({
            date: '2026-10-31',
            nextDate: '2026-11-01',
            bitrixFrom: '31.10.2026',
            bitrixTo: '01.11.2026',
        });
    });

    it('закрытый день живёт долго, сегодня и будущее — коротко', () => {
        const now = new Date(2026, 9, 14, 12, 0, 0);
        expect(isClosedDay('2026-10-13', now)).toBe(true);
        expect(isClosedDay('2026-10-14', now)).toBe(false);
        expect(ttlForDigestDay('2026-10-13', now)).toBe(
            KPI_DIGEST_CLOSED_DAY_TTL_SECONDS,
        );
        expect(ttlForDigestDay('2026-10-14', now)).toBe(
            KPI_DIGEST_OPEN_DAY_TTL_SECONDS,
        );
        expect(ttlForDigestDay('2026-10-20', now)).toBe(
            KPI_DIGEST_OPEN_DAY_TTL_SECONDS,
        );
    });
});
