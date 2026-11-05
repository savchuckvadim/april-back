import { lastWorkdays, WorkCalendar } from './workdays.util';

/**
 * Во сколько раз окна можно уйти назад, пропуская дни без звонков: пара
 * неизвестных календарю выходных окно растянет, а остановившийся конвейер
 * не превратит «пульс» в картину трёхнедельной давности.
 */
export const PULSE_WINDOW_LOOKBACK_FACTOR = 2;

/**
 * Рабочие дни окна пульса. Без activeDays — последние count рабочих дней
 * календаря. С activeDays (дни, в которые были звонки) — последние count
 * рабочих дней календаря со звонками: рабочий по календарю день, в который
 * не было ни одного звонка, — это выходной, которого календарь не знает
 * (праздник, перенос, корпоратив), и вместо него берётся день раньше.
 * Назад уходим не дальше count × PULSE_WINDOW_LOOKBACK_FACTOR рабочих
 * дней; звонков там нет вовсе — окно по календарю, чтобы витрина честно
 * показала период без звонков. Дни по возрастанию.
 */
export function pulseWindowDays(
    endDate: string,
    count: number,
    calendar: WorkCalendar,
    activeDays?: ReadonlySet<string>,
): string[] {
    const byCalendar = lastWorkdays(endDate, count, calendar);
    if (!activeDays) return byCalendar;

    const active = lastWorkdays(
        endDate,
        count * PULSE_WINDOW_LOOKBACK_FACTOR,
        calendar,
    )
        .filter(day => activeDays.has(day))
        .slice(-count);

    return active.length ? active : byCalendar;
}
