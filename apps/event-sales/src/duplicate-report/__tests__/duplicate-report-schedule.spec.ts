import { ETimeZone } from '@lib/shared/lib/date';
import {
    fallbackWorkingHours,
    PortalWorkingHours,
} from '../../shared/working-hours/working-hours.model';
import {
    isReportTimeReached,
    reportPeriod,
    reportTaskDeadline,
    reportWeekKey,
} from '../lib/duplicate-report-schedule';

const MSK = ETimeZone.EUROPE_MOSCOW;
/** Момент по московскому времени (UTC+3, без перехода на летнее). */
const msk = (iso: string): Date => new Date(`${iso}+03:00`);

const HOURS: PortalWorkingHours = fallbackWorkingHours();

describe('календарь отчёта по дублям', () => {
    describe('ключ недели', () => {
        it('понедельник этой недели по TZ портала', () => {
            expect(reportWeekKey(msk('2026-10-05T09:00:00'), MSK)).toBe(
                '2026-10-05',
            );
            expect(reportWeekKey(msk('2026-10-11T23:30:00'), MSK)).toBe(
                '2026-10-05',
            );
        });

        it('ночь на понедельник по Москве — уже новая неделя, хотя по UTC воскресенье', () => {
            const sundayUtc = new Date('2026-10-04T22:30:00Z');
            expect(reportWeekKey(sundayUtc, MSK)).toBe('2026-10-05');
        });
    });

    describe('время отчёта наступило', () => {
        const MONDAY_9 = { weekday: 1, hour: 9 };

        it('в нужный день до часа — нет, с часа — да', () => {
            expect(
                isReportTimeReached(msk('2026-10-05T08:59:00'), MSK, MONDAY_9),
            ).toBe(false);
            expect(
                isReportTimeReached(msk('2026-10-05T09:00:00'), MSK, MONDAY_9),
            ).toBe(true);
        });

        it('позже на неделе — да (прогон догоняет пропущенный день), но не раньше часа', () => {
            expect(
                isReportTimeReached(msk('2026-10-07T12:00:00'), MSK, MONDAY_9),
            ).toBe(true);
            // Ночью задача руководителю не прилетает и в дни догона.
            expect(
                isReportTimeReached(msk('2026-10-07T03:00:00'), MSK, MONDAY_9),
            ).toBe(false);
        });

        it('раньше дня отчёта — нет', () => {
            expect(
                isReportTimeReached(msk('2026-10-07T12:00:00'), MSK, {
                    weekday: 5,
                    hour: 9,
                }),
            ).toBe(false);
        });
    });

    it('период — семь полных дней до дня прогона', () => {
        const period = reportPeriod(msk('2026-10-05T09:00:00'), MSK);
        expect(period.label).toBe('28.09–04.10');
        expect(period.from.toISOString()).toBe('2026-09-27T21:00:00.000Z');
        // Конец — начало дня отчёта: ночная заявка понедельника — в следующем отчёте.
        expect(period.to.toISOString()).toBe('2026-10-04T21:00:00.000Z');
    });

    describe('срок задачи', () => {
        it('понедельник утром, три дня — среда 18:00', () => {
            expect(
                reportTaskDeadline(HOURS, msk('2026-10-05T09:00:00'), 3, MSK),
            ).toEqual(msk('2026-10-07T18:00:00'));
        });

        it('пятница вечером — счёт с понедельника, срок в среду', () => {
            expect(
                reportTaskDeadline(HOURS, msk('2026-10-09T19:00:00'), 3, MSK),
            ).toEqual(msk('2026-10-14T18:00:00'));
        });

        it('праздник портала пропускается', () => {
            const hours: PortalWorkingHours = {
                ...HOURS,
                yearHolidays: new Set(['6.10']),
            };
            expect(
                reportTaskDeadline(hours, msk('2026-10-05T09:00:00'), 2, MSK),
            ).toEqual(msk('2026-10-07T18:00:00'));
        });

        it('график без рабочего времени — просто N суток', () => {
            const now = msk('2026-10-05T09:00:00');
            expect(
                reportTaskDeadline(
                    { ...HOURS, startHour: 18, endHour: 9 },
                    now,
                    2,
                    MSK,
                ),
            ).toEqual(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));
        });
    });
});
