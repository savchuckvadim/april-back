import { ETimeZone } from '@lib/shared/lib/date';
import { RopWorkdayCalendar } from '../period/rop-schedule';

/**
 * Календарь портала глазами отчёта: таймзона, рабочие дни (для «пора
 * ли выпускать») и срок задачи в рабочих днях. Живёт в приложении
 * (event-sales: `PortalWorkingHoursService` и расчёт срока как у отчёта
 * по дублям); календарь портала недоступен — адаптер отдаёт запасной
 * график, а не ошибку.
 */
export interface RopPortalCalendar {
    readonly timezone: ETimeZone;
    readonly calendar: RopWorkdayCalendar;
    /** Срок задачи: конец N-го рабочего дня, считая день выпуска. */
    deadline(now: Date, workingDays: number): Date;
}

export interface RopCalendarPort {
    resolve(domain: string): Promise<RopPortalCalendar>;
}
