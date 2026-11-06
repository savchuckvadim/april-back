import { DEFAULT_WORK_CALENDAR } from '../../workdays.util';
import {
    ownerReportDueKinds,
    workdayOrdinalInMonth,
} from '../owner-report.schedule';

describe('расписание отчёта собственнику', () => {
    it('порядковый рабочий день месяца; выходной — null', () => {
        // Ноябрь 2026: 1-е — воскресенье, 2-е — понедельник.
        expect(workdayOrdinalInMonth('2026-11-02', DEFAULT_WORK_CALENDAR)).toBe(
            1,
        );
        expect(workdayOrdinalInMonth('2026-11-03', DEFAULT_WORK_CALENDAR)).toBe(
            2,
        );
        expect(
            workdayOrdinalInMonth('2026-11-01', DEFAULT_WORK_CALENDAR),
        ).toBeNull();
        // Праздник портала не считается рабочим днём.
        const withHoliday = {
            ...DEFAULT_WORK_CALENDAR,
            holidays: [...DEFAULT_WORK_CALENDAR.holidays, '2026-11-02'],
        };
        expect(workdayOrdinalInMonth('2026-11-03', withHoliday)).toBe(1);
    });

    it('виды периодов, закрывшиеся с началом месяца', () => {
        const all = ['month', 'quarter', 'half_year', 'year'] as const;
        expect(ownerReportDueKinds(all, '2026-11-03')).toEqual(['month']);
        expect(ownerReportDueKinds(all, '2026-10-02')).toEqual([
            'month',
            'quarter',
        ]);
        expect(ownerReportDueKinds(all, '2026-07-02')).toEqual([
            'month',
            'quarter',
            'half_year',
        ]);
        expect(ownerReportDueKinds(all, '2027-01-12')).toEqual(all);
        expect(ownerReportDueKinds(['quarter'], '2026-11-03')).toEqual([]);
    });
});
