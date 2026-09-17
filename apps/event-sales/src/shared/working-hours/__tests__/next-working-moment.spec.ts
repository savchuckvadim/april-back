import { ETimeZone } from '@lib/shared/lib/date';
import { nextWorkingMoment, PortalWorkingHours } from '../working-hours.model';

/** График портала: пн–пт 9:00–18:00, суббота и воскресенье выходные. */
const hours: PortalWorkingHours = {
    startHour: 9,
    endHour: 18,
    weekHolidays: [0, 6],
    yearHolidays: new Set(['1.1']),
    source: 'portal',
};

const TZ = ETimeZone.EUROPE_MOSCOW;

/** Момент в таймзоне портала: строка без зоны читается как местное время. */
const at = (iso: string): Date => new Date(`${iso}+03:00`);

describe('nextWorkingMoment', () => {
    /*
     * Ради этого всё и делалось: робот ставит срок формулой «ровно через
     * сутки», заявка падает в четыре утра — и задача встаёт на четыре утра
     * (наблюдалось на бою 17.09.2026).
     */
    it('четыре утра рабочего дня переезжают на начало того же дня', () => {
        const result = nextWorkingMoment(hours, at('2026-09-17T04:00:00'), TZ);
        expect(result.toISOString()).toBe(
            at('2026-09-17T09:00:00').toISOString(),
        );
    });

    it('рабочее время не трогается', () => {
        const moment = at('2026-09-17T14:30:00');
        expect(nextWorkingMoment(hours, moment, TZ)).toBe(moment);
    });

    it('вечер пятницы переезжает на утро понедельника', () => {
        // 18.09.2026 — пятница, 21.09.2026 — понедельник.
        const result = nextWorkingMoment(hours, at('2026-09-18T22:00:00'), TZ);
        expect(result.toISOString()).toBe(
            at('2026-09-21T09:00:00').toISOString(),
        );
    });

    it('суббота переезжает на утро понедельника', () => {
        const result = nextWorkingMoment(hours, at('2026-09-19T11:00:00'), TZ);
        expect(result.toISOString()).toBe(
            at('2026-09-21T09:00:00').toISOString(),
        );
    });

    it('праздник пропускается', () => {
        // 1 января 2027 — пятница и праздник; ближайший рабочий — 4 января.
        const result = nextWorkingMoment(hours, at('2027-01-01T10:00:00'), TZ);
        expect(result.toISOString()).toBe(
            at('2027-01-04T09:00:00').toISOString(),
        );
    });
});
