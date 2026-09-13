import { ETimeZone } from '@lib/shared/lib/date';
import { IBXCalendarSettings } from '@lib/bitrix/domain/calendar/interface/bx-calendar.interface';
import {
    fallbackWorkingHours,
    isWithinWorkingHours,
    toPortalWorkingHours,
    workingHoursAgo,
} from '../working-hours.model';

/**
 * Гейт рабочего времени для кронов. Ошибка в сторону «рабочее» ставит
 * клиенту звонок ночью или 1 января; в сторону «нерабочее» — просто
 * откладывает тик. Поэтому дефолт консервативный, и это зафиксировано.
 */
const MSK = ETimeZone.EUROPE_MOSCOW;

/** Момент в TZ портала → Date. */
const mskAt = (iso: string, offset = '+03:00') => new Date(`${iso}${offset}`);

describe('toPortalWorkingHours — разбор настроек портала', () => {
    const base: IBXCalendarSettings = {
        work_time_start: '9',
        work_time_end: '19',
        year_holidays: '1.1,7.1,23.2',
        week_holidays: ['SA', 'SU'],
    };

    it('строки из документации', () => {
        const hours = toPortalWorkingHours(base);

        expect(hours).toMatchObject({
            startHour: 9,
            endHour: 19,
            weekHolidays: [6, 0],
            source: 'portal',
        });
        expect(hours.yearHolidays.has('23.2')).toBe(true);
    });

    it('числа, которые порталы шлют вопреки документации', () => {
        const hours = toPortalWorkingHours({
            ...base,
            work_time_start: 8.5,
            work_time_end: 17.5,
        });

        expect(hours.startHour).toBe(8.5);
        expect(hours.endHour).toBe(17.5);
    });

    it('мусор в часах → дефолт, а не NaN', () => {
        const hours = toPortalWorkingHours({
            ...base,
            work_time_start: 'утром',
            work_time_end: '99',
        });

        expect(hours.startHour).toBe(9);
        expect(hours.endHour).toBe(18);
    });

    it('пробелы и пустые куски в праздниках вычищаются', () => {
        const hours = toPortalWorkingHours({
            ...base,
            year_holidays: '1.1, 7.1 ,,8.3,',
        });

        expect([...hours.yearHolidays].sort()).toEqual(['1.1', '7.1', '8.3']);
    });

    it('неизвестный код дня недели игнорируется, остальные остаются', () => {
        const hours = toPortalWorkingHours({
            ...base,
            week_holidays: ['SA', 'XX', 'SU'] as string[],
        });

        expect(hours.weekHolidays).toEqual([6, 0]);
    });
});

describe('isWithinWorkingHours', () => {
    const hours = toPortalWorkingHours({
        work_time_start: '9',
        work_time_end: '18',
        year_holidays: '1.1,23.2',
        week_holidays: ['SA', 'SU'],
    });

    it.each([
        ['утро рабочего дня', '2026-09-14T09:00:00', true],
        ['середина дня', '2026-09-14T13:30:00', true],
        ['за минуту до конца', '2026-09-14T17:59:00', true],
        ['ровно конец дня — уже нерабочее', '2026-09-14T18:00:00', false],
        ['до начала', '2026-09-14T08:59:00', false],
        ['ночь', '2026-09-14T03:00:00', false],
    ])('%s', (_case, iso, expected) => {
        expect(isWithinWorkingHours(hours, mskAt(iso), MSK)).toBe(expected);
    });

    it('суббота — выходной даже в рабочие часы', () => {
        // 2026-09-12 — суббота.
        expect(
            isWithinWorkingHours(hours, mskAt('2026-09-12T12:00:00'), MSK),
        ).toBe(false);
    });

    it('праздник — выходной даже в будни', () => {
        // 2026-02-23 — понедельник и праздник.
        expect(
            isWithinWorkingHours(hours, mskAt('2026-02-23T12:00:00'), MSK),
        ).toBe(false);
    });

    /*
     * Ключевое: считаем в TZ ПОРТАЛА, а не сервера. Один и тот же момент
     * для московского портала рабочий, для новосибирского — уже вечер.
     */
    it('один момент: рабочий для Москвы, нерабочий для Новосибирска', () => {
        const moment = mskAt('2026-09-14T17:00:00'); // 17:00 МСК = 21:00 НСК

        expect(isWithinWorkingHours(hours, moment, MSK)).toBe(true);
        expect(
            isWithinWorkingHours(hours, moment, ETimeZone.ASIA_NOVOSIBIRSK),
        ).toBe(false);
    });

    it('дробные часы: 8.5 — это 8:30', () => {
        const halfHour = toPortalWorkingHours({
            work_time_start: 8.5,
            work_time_end: 18,
            year_holidays: '',
            week_holidays: ['SA', 'SU'],
        });

        expect(
            isWithinWorkingHours(halfHour, mskAt('2026-09-14T08:29:00'), MSK),
        ).toBe(false);
        expect(
            isWithinWorkingHours(halfHour, mskAt('2026-09-14T08:31:00'), MSK),
        ).toBe(true);
    });
});

describe('fallbackWorkingHours — когда портал недоступен', () => {
    it('консервативный график пн–пт 9–18 с праздниками РФ', () => {
        const hours = fallbackWorkingHours();

        expect(hours.source).toBe('fallback');
        expect(hours.startHour).toBe(9);
        expect(hours.endHour).toBe(18);
        expect(
            isWithinWorkingHours(hours, mskAt('2026-09-14T12:00:00'), MSK),
        ).toBe(true);
        expect(
            isWithinWorkingHours(hours, mskAt('2026-01-01T12:00:00'), MSK),
        ).toBe(false);
    });

    it('возвращает независимую копию — мутация не протекает между вызовами', () => {
        const first = fallbackWorkingHours();
        first.yearHolidays.add('31.12');

        expect(fallbackWorkingHours().yearHolidays.has('31.12')).toBe(false);
    });
});

describe('workingHoursAgo — окно, которое не съедают выходные', () => {
    const hours = toPortalWorkingHours({
        work_time_start: '9',
        work_time_end: '18',
        year_holidays: '1.1,2.1,3.1',
        week_holidays: ['SA', 'SU'],
    });

    /*
     * Главный случай: звонок назначен в пятницу вечером, хук упал.
     * Утром вторника календарных часов прошло больше 96 — по календарному
     * окну работа потеряна навсегда. По рабочим дням она ещё в окне.
     */
    it('пятничный звонок остаётся в окне утром вторника', () => {
        const tuesday = mskAt('2026-09-15T10:00:00'); // вторник
        const friday = mskAt('2026-09-11T18:00:00'); // пятница

        const calendarEdge = new Date(tuesday.getTime() - 96 * 60 * 60 * 1000);
        expect(friday.getTime()).toBeGreaterThan(calendarEdge.getTime());

        const workingEdge = workingHoursAgo(hours, tuesday, 96, MSK);
        expect(friday.getTime()).toBeGreaterThan(workingEdge.getTime());
        // И граница действительно уехала дальше в прошлое, чем календарная.
        expect(workingEdge.getTime()).toBeLessThan(calendarEdge.getTime());
    });

    it('внутри рабочей недели совпадает с календарным отсчётом', () => {
        // Со среды на 48 часов назад — понедельник, выходных по пути нет.
        const wednesday = mskAt('2026-09-16T12:00:00');
        const edge = workingHoursAgo(hours, wednesday, 48, MSK);

        expect(edge.toISOString()).toBe(
            new Date(wednesday.getTime() - 48 * 60 * 60 * 1000).toISOString(),
        );
    });

    it('праздники тоже не съедают окно', () => {
        // 1–3 января — праздники; отсчёт от 5 января должен их перешагнуть.
        const jan5 = mskAt('2026-01-05T12:00:00');
        const edge = workingHoursAgo(hours, jan5, 24, MSK);

        expect(edge.getTime()).toBeLessThan(
            mskAt('2026-01-03T12:00:00').getTime(),
        );
    });

    it('нулевое окно возвращает исходный момент', () => {
        const now = mskAt('2026-09-16T12:00:00');
        expect(workingHoursAgo(hours, now, 0, MSK).toISOString()).toBe(
            now.toISOString(),
        );
    });

    it('портал без рабочих дней не вешает цикл', () => {
        const noWork = toPortalWorkingHours({
            work_time_start: '9',
            work_time_end: '18',
            year_holidays: '',
            week_holidays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
        });

        const now = mskAt('2026-09-16T12:00:00');
        const edge = workingHoursAgo(noWork, now, 96, MSK);

        expect(edge.getTime()).toBeLessThan(now.getTime());
    });
});
