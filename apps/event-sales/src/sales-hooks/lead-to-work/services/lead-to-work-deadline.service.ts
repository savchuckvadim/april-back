import { Injectable, Logger } from '@nestjs/common';
import { BitrixDateTime } from '@lib/shared/lib/date';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { SalesHookExecutionContext } from '../../core/contracts/sales-hook-use-case.contract';
import { LeadToWorkAssigneeSource } from './lead-to-work-assignee.service';
import { PortalWorkingHoursService } from '../../../shared/working-hours/portal-working-hours.service';
import { shiftDeadlineToWorkingHours } from '../../../shared/working-hours/working-hours.model';
import { addWorkingMinutes } from '../../../shared/working-hours/working-minutes.util';
import {
    SLA_MIN_MINUTES,
    slaThresholdMinutes,
} from '../../../shared/lead-request/sla-threshold.util';

/** Сутки — срок повторной заявки, если его не прислали (как у роботов). */
const REPEAT_DEADLINE_DAYS = 1;

type DeadlineContext = Pick<SalesHookExecutionContext, 'domain' | 'portal'>;

/** Что нужно знать о заявке, чтобы назначить срок задачи. */
export interface LeadToWorkDeadlineInput {
    /** Откуда ответственный: круг, явное имя, владелец работы клиента… */
    source: LeadToWorkAssigneeSource;
    /** ХО (задача обзвона) или перенос работы как есть. */
    isXo: 'Y' | 'N';
    /** Срок из запроса или поля «Дата ХО» карточки. */
    deadline?: string;
}

/**
 * СРОК ЗАДАЧИ ХО при передаче заявки в работу.
 *
 * - Распределение ПО КРУГУ (первое и повторное из SLA): срок — порог SLA
 *   («SLA: минут на принятие», не меньше часа) в РАБОЧИХ минутах от
 *   назначения. Дата ХО из карточки игнорируется: робот ставит её формулой
 *   «+1 день», а решение владельца 30.09.2026 — «через час после
 *   назначения; кончается день — на утро следующего рабочего». Тот же
 *   порог и та же мера у SLA: заявку заберут ровно в срок.
 * - Присланный срок (явный сотрудник, адресный ХО) — как прислали, но в
 *   рабочее время портала: человек сам решил, когда звонить.
 * - Повторная заявка без срока — сутки, в рабочее время.
 * - Прочее без срока — без срока.
 */
@Injectable()
export class LeadToWorkDeadlineService {
    private readonly logger = new Logger(LeadToWorkDeadlineService.name);

    constructor(
        private readonly appSettings: PortalAppSettingsService,
        /** График портала: срок не должен попадать в ночь и выходные. */
        private readonly workingHours: PortalWorkingHoursService,
    ) {}

    async resolve(
        ctx: DeadlineContext,
        input: LeadToWorkDeadlineInput,
    ): Promise<string | undefined> {
        if (input.source === 'round-robin' && input.isXo === 'Y') {
            return this.roundRobinDeadline(ctx);
        }
        if (input.deadline) return this.toWorkingTime(ctx, input.deadline);
        if (input.source === 'repeat') {
            const next = new Date();
            next.setDate(next.getDate() + REPEAT_DEADLINE_DAYS);
            return this.toWorkingTime(ctx, next.toISOString());
        }
        return undefined;
    }

    /** Порог SLA рабочих минут от «сейчас» — строкой CRM в локали портала. */
    private async roundRobinDeadline(ctx: DeadlineContext): Promise<string> {
        const timezone = ctx.portal.getTimezone();
        try {
            const [{ hours }, settings] = await Promise.all([
                this.workingHours.resolve(ctx.domain),
                this.appSettings.resolve(
                    ctx.domain,
                    EnumPortalAppCode.eventSales,
                ),
            ]);
            const minutes = slaThresholdMinutes(settings.leadIntakeSlaMinutes);
            const at = addWorkingMinutes(hours, new Date(), minutes, timezone);
            return BitrixDateTime.fromInstant(at, timezone).toCrmDateTime();
        } catch (error) {
            this.logger.warn(
                `[deadline] ${ctx.domain}: график или настройки не прочитаны ` +
                    `(${(error as Error).message}) — срок через ${SLA_MIN_MINUTES} мин`,
            );
            const at = new Date(Date.now() + SLA_MIN_MINUTES * 60_000);
            return BitrixDateTime.fromInstant(at, timezone).toCrmDateTime();
        }
    }

    /**
     * Срок разбирается в ОБЕИХ формах — ISO из запроса и
     * «23.09.2026 05:41:32» из карточки лида (сделка 84763, 22.09.2026:
     * `new Date` вторую форму не читал и оставлял ночной срок ночным).
     */
    private async toWorkingTime(
        ctx: DeadlineContext,
        deadline: string,
    ): Promise<string> {
        const { domain } = ctx;
        try {
            const { hours } = await this.workingHours.resolve(domain);
            const moved = shiftDeadlineToWorkingHours(
                deadline,
                hours,
                ctx.portal.getTimezone(),
            );
            if (moved === null) {
                this.logger.warn(
                    `[deadline] ${domain}: срок «${deadline}» не распознан — оставлен как есть`,
                );
                return deadline;
            }
            if (moved !== deadline) {
                this.logger.log(
                    `[deadline] ${domain}: срок ${deadline} вне рабочего времени — перенесён на ${moved}`,
                );
            }
            return moved;
        } catch (error) {
            this.logger.warn(
                `[deadline] ${domain}: график не прочитан (${(error as Error).message}) — ` +
                    'срок оставлен как есть',
            );
            return deadline;
        }
    }
}
