import { Injectable } from '@nestjs/common';
import type { RopCalendarPort, RopPortalCalendar } from '@lib/rop-reports';
import { reportTaskDeadline } from '../../duplicate-report/lib/duplicate-report-schedule';
import { PortalWorkingHoursService } from '../../shared/working-hours/portal-working-hours.service';
import type { PortalWorkingHours } from '../../shared/working-hours/working-hours.model';

/**
 * Календарь портала для каркаса отчётов РОПу: таймзона портала, рабочие
 * дни по производственному календарю (`calendar.settings.get`, при сбое —
 * консервативный дефолт) и срок задачи в рабочих днях — как у отчёта по
 * дублям. График читается через `PortalWorkingHoursService` (кэш на час).
 *
 * `@Injectable` без bitrix-состояния: инстанс Битрикса берёт сервис графика
 * через `PBXService.init(domain)` на каждый вызов.
 */
@Injectable()
export class PeriodDigestCalendarAdapter implements RopCalendarPort {
    constructor(private readonly workingHours: PortalWorkingHoursService) {}

    async resolve(domain: string): Promise<RopPortalCalendar> {
        const { hours, timezone } = await this.workingHours.resolve(domain);
        return {
            timezone,
            calendar: { isWorkday: day => isWorkdayOf(hours, day) },
            deadline: (now, workingDays) =>
                reportTaskDeadline(hours, now, workingDays, timezone),
        };
    }
}

/** Рабочий ли день портала ('YYYY-MM-DD'): не выходной и не праздник. */
export function isWorkdayOf(hours: PortalWorkingHours, day: string): boolean {
    const [, month, date] = day.split('-').map(Number);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (hours.weekHolidays.includes(weekday)) return false;
    return !hours.yearHolidays.has(`${date}.${month}`);
}
