import { ETimeZone } from '@lib/shared/lib/date';
import { PortalWorkingHours } from '../working-hours.model';
import {
    addWorkingMinutes,
    workingMinutesBefore,
} from '../working-minutes.util';

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
const iso = (date: Date): string => date.toISOString();

// 30.09.2026 — среда, 02.10.2026 — пятница, 05.10.2026 — понедельник.
describe('addWorkingMinutes — срок принятия заявки', () => {
    it('днём — ровно через час', () => {
        expect(
            iso(addWorkingMinutes(hours, at('2026-09-30T14:20:00'), 60, TZ)),
        ).toBe(iso(at('2026-09-30T15:20:00')));
    });

    it('день кончается раньше часа — остаток утром следующего рабочего дня', () => {
        expect(
            iso(addWorkingMinutes(hours, at('2026-09-30T17:30:00'), 60, TZ)),
        ).toBe(iso(at('2026-10-01T09:30:00')));
    });

    it('час ровно до конца дня — срок в 18:00 того же дня', () => {
        expect(
            iso(addWorkingMinutes(hours, at('2026-09-30T17:00:00'), 60, TZ)),
        ).toBe(iso(at('2026-09-30T18:00:00')));
    });

    it('ночью — час от начала рабочего дня', () => {
        expect(
            iso(addWorkingMinutes(hours, at('2026-09-30T23:10:00'), 60, TZ)),
        ).toBe(iso(at('2026-10-01T10:00:00')));
    });

    it('вечер пятницы — утро понедельника', () => {
        expect(
            iso(addWorkingMinutes(hours, at('2026-10-02T17:45:00'), 60, TZ)),
        ).toBe(iso(at('2026-10-05T09:45:00')));
    });

    it('неделя без рабочих дней — календарные минуты, без зацикливания', () => {
        const always: PortalWorkingHours = {
            ...hours,
            weekHolidays: [0, 1, 2, 3, 4, 5, 6],
        };
        expect(
            iso(addWorkingMinutes(always, at('2026-09-30T14:00:00'), 60, TZ)),
        ).toBe(iso(at('2026-09-30T15:00:00')));
    });
});

describe('workingMinutesBefore — граница просрочки SLA', () => {
    it('днём — час назад', () => {
        expect(
            iso(workingMinutesBefore(hours, at('2026-09-30T15:00:00'), 60, TZ)),
        ).toBe(iso(at('2026-09-30T14:00:00')));
    });

    it('в 9:30 — 17:30 прошлого рабочего дня (вечер + утро)', () => {
        expect(
            iso(workingMinutesBefore(hours, at('2026-10-01T09:30:00'), 60, TZ)),
        ).toBe(iso(at('2026-09-30T17:30:00')));
    });

    it('в понедельник 9:45 — пятница 17:45: выходные не считаются', () => {
        expect(
            iso(workingMinutesBefore(hours, at('2026-10-05T09:45:00'), 60, TZ)),
        ).toBe(iso(at('2026-10-02T17:45:00')));
    });

    it('вечером после конца дня — отсчёт от 18:00', () => {
        expect(
            iso(workingMinutesBefore(hours, at('2026-09-30T21:00:00'), 60, TZ)),
        ).toBe(iso(at('2026-09-30T17:00:00')));
    });

    /*
     * Ради этого SLA и переведён на рабочие минуты: ночная заявка утром
     * не просрочена — у менеджера ещё час рабочего времени.
     */
    it('заявка ночью: в 9:10 не просрочена, в 10:00 — просрочена', () => {
        const assigned = at('2026-09-30T23:10:00').getTime();
        const at0910 = workingMinutesBefore(
            hours,
            at('2026-10-01T09:10:00'),
            60,
            TZ,
        );
        const at1000 = workingMinutesBefore(
            hours,
            at('2026-10-01T10:00:00'),
            60,
            TZ,
        );

        expect(assigned < at0910.getTime()).toBe(false);
        expect(assigned <= at1000.getTime()).toBe(true);
    });

    it('срок и граница согласованы: через час рабочего времени заявка ровно просрочена', () => {
        const assigned = at('2026-09-30T17:30:00');
        const deadline = addWorkingMinutes(hours, assigned, 60, TZ);

        expect(iso(workingMinutesBefore(hours, deadline, 60, TZ))).toBe(
            iso(assigned),
        );
    });
});
