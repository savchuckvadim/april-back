import { ETimeZone } from '@lib/shared/lib/date';
import {
    PortalWorkingHours,
    shiftDeadlineToWorkingHours,
} from '../working-hours.model';

/** График портала garantservisvoronezh: 9:00–19:00, выходные сб и вс. */
const hours: PortalWorkingHours = {
    startHour: 9,
    endHour: 19,
    weekHolidays: [0, 6],
    yearHolidays: new Set(),
    source: 'portal',
};

const TZ = ETimeZone.EUROPE_MOSCOW;

describe('shiftDeadlineToWorkingHours', () => {
    /*
     * Сделка 84763, 22.09.2026: робот записал в лид «23.09.2026 05:41:32»,
     * интент положил это в deadline как есть, а `new Date` такой формат не
     * читает — задача ушла на 05:41 при графике с 09:00.
     */
    it('срок в формате поля Битрикса сдвигается к началу рабочего дня', () => {
        expect(
            shiftDeadlineToWorkingHours('23.09.2026 05:41:32', hours, TZ),
        ).toBe('23.09.2026 09:00:00');
    });

    it('ISO со смещением из запроса тоже понимается', () => {
        expect(
            shiftDeadlineToWorkingHours('2026-09-23T05:41:32+03:00', hours, TZ),
        ).toBe('23.09.2026 09:00:00');
    });

    it('срок в рабочее время остаётся тем же моментом', () => {
        expect(
            shiftDeadlineToWorkingHours('23.09.2026 14:20:00', hours, TZ),
        ).toBe('23.09.2026 14:20:00');
    });

    it('вечер после работы — утро следующего рабочего дня', () => {
        expect(
            shiftDeadlineToWorkingHours('22.09.2026 21:30:00', hours, TZ),
        ).toBe('23.09.2026 09:00:00');
    });

    it('суббота — понедельник 09:00', () => {
        expect(
            shiftDeadlineToWorkingHours('26.09.2026 11:00:00', hours, TZ),
        ).toBe('28.09.2026 09:00:00');
    });

    it('мусор — null, а не тихая подмена', () => {
        expect(shiftDeadlineToWorkingHours('завтра', hours, TZ)).toBeNull();
    });
});
