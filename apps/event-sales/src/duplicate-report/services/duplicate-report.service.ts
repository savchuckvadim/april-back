import { Injectable, Logger } from '@nestjs/common';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { BitrixService } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { BxDepartmentService } from '@lib/bx-department';
import { ActiveStaffService } from '../../shared/active-staff/active-staff.service';
import { loadSalesDepartments } from '../../shared/department-heads/sales-departments.loader';
import { UserNameResolver } from '../../shared/lead-request/user-name.resolver';
import { PortalWorkingHoursService } from '../../shared/working-hours/portal-working-hours.service';
import { DUPLICATE_RECIPIENT_ROLE } from '../constants/duplicate-report.const';
import {
    assignRecipients,
    hasDuplicateRecipients,
} from '../lib/duplicate-recipients';
import { reportPeriod } from '../lib/duplicate-report-schedule';
import { summarizeDuplicateReport } from '../lib/duplicate-report-summary';
import {
    ClassifiedClient,
    DuplicateRecipientReport,
    DuplicateReportOptions,
    DuplicateReportRunResult,
} from '../types/duplicate-report.types';
import { DuplicateReportCollector } from './duplicate-report.collector';
import { DuplicateReportDispatcher } from './duplicate-report.dispatcher';
import { DuplicateReportTaskStore } from './duplicate-report-task.store';

/** Необязательные параметры одного прогона (ручка). */
export interface DuplicateReportRunParams {
    /**
     * Пробный прогон: весь отчёт — одной задачей этому сотруднику;
     * настроенным получателям ничего не ставится.
     */
    readonly previewUserId?: number;
}

/** Отчёт пробного прогона: все клиенты портала одному человеку. */
const previewReport = (
    userId: number,
    clients: readonly ClassifiedClient[],
): DuplicateRecipientReport => ({
    userId,
    roles: [DUPLICATE_RECIPIENT_ROLE.structure],
    clients,
});

export const NO_RECIPIENTS_WARNING =
    'получатели отчёта не заданы — включите «Отчёт РОПу» или укажите сотрудников';

/**
 * Отчёт по дублям сделок одного портала: прочитать и разобрать
 * ({@link DuplicateReportCollector}), разложить по получателям и — если не
 * «только считать» — разослать задачи с Excel
 * ({@link DuplicateReportDispatcher}). Сами сделки модуль НЕ трогает:
 * присоединяют люди.
 *
 * `@Injectable`, но инстанс Битрикса живёт только внутри вызова: в полях
 * лишь PBXService и инфраструктура (CLAUDE.md — иначе гонка порталов).
 */
@Injectable()
export class DuplicateReportService {
    private readonly logger = new Logger(DuplicateReportService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly departments: BxDepartmentService,
        private readonly staff: ActiveStaffService,
        private readonly userNames: UserNameResolver,
        private readonly workingHours: PortalWorkingHoursService,
        private readonly taskStore: DuplicateReportTaskStore,
    ) {}

    async runForDomain(
        domain: string,
        options: DuplicateReportOptions,
        now: Date = new Date(),
        run: DuplicateReportRunParams = {},
    ): Promise<DuplicateReportRunResult> {
        const preview = run.previewUserId ?? null;
        // Пробный прогон всегда ставит задачу — иначе смотреть нечего.
        const countOnly = options.countOnly && preview === null;
        const warnings: string[] = [];
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
        const timezone = portal.getTimezone();
        const period = reportPeriod(now, timezone);

        const snapshot = await new DuplicateReportCollector(
            bitrix,
            portal,
            domain,
            this.staff,
        ).collect(
            {
                now,
                periodStart: period.from,
                periodEnd: period.to,
                excludeUserIds: options.excludeUserIds,
            },
            warnings,
        );
        const reports = !snapshot.clients.length
            ? []
            : preview !== null
              ? [previewReport(preview, snapshot.clients)]
              : await this.recipients(
                    domain,
                    bitrix,
                    snapshot.clients,
                    options,
                    warnings,
                );
        /*
         * Рассылка — и когда дублей нет вовсе: тогда закрываются прошлые
         * задачи-отчёты (список в них устарел). Пробный прогон без дублей
         * ничего не трогает.
         */
        const dispatch =
            !countOnly &&
            (reports.length > 0 ||
                (preview === null && !snapshot.clients.length));
        const delivered = dispatch
            ? await new DuplicateReportDispatcher(
                  bitrix,
                  this.taskStore,
                  this.userNames,
                  this.workingHours,
              ).dispatch(
                  {
                      domain,
                      reports,
                      period,
                      timezone,
                      now,
                      ownerId: snapshot.ownerId,
                      deadlineDays: options.deadlineDays,
                      preview: preview !== null,
                  },
                  warnings,
              )
            : { tasksCreated: 0, tasksClosed: 0 };
        const result: DuplicateReportRunResult = {
            ...summarizeDuplicateReport({
                domain,
                countOnly,
                scanned: snapshot.scanned,
                clients: snapshot.clients,
                recipients: reports.length,
                warnings,
            }),
            ...delivered,
        };

        this.logger.log(
            `[duplicate-report] ${domain}: сделок ${result.scanned}, клиентов ` +
                `${result.clients}, получателей ${result.recipients}, задач ` +
                `${result.tasksCreated}` +
                (countOnly ? ' (только считать)' : '') +
                (preview !== null ? ` (проба: только ${preview})` : '') +
                (warnings.length ? `, warnings ${warnings.length}` : ''),
        );
        return result;
    }

    /** Получатели по настройкам; уволенным задача не ставится. */
    private async recipients(
        domain: string,
        bitrix: BitrixService,
        clients: readonly ClassifiedClient[],
        options: DuplicateReportOptions,
        warnings: string[],
    ): Promise<DuplicateRecipientReport[]> {
        if (!hasDuplicateRecipients(options.recipients)) {
            warnings.push(NO_RECIPIENTS_WARNING);
            return [];
        }
        const { toHead, departmentUserIds } = options.recipients;
        const structure =
            toHead || departmentUserIds.length
                ? await loadSalesDepartments(this.departments, domain, warnings)
                : [];
        const reports = assignRecipients(
            clients,
            structure,
            options.recipients,
            warnings,
        );
        if (!reports.length) return reports;

        try {
            const active = await this.staff.activeUserIds(
                domain,
                bitrix,
                reports.map(report => report.userId),
            );
            const gone = reports.filter(report => !active.has(report.userId));
            if (gone.length) {
                warnings.push(
                    `получатели не работают — задачи им не ставятся: ${gone
                        .map(report => report.userId)
                        .join(', ')}`,
                );
            }
            return reports.filter(report => active.has(report.userId));
        } catch (error) {
            warnings.push(
                `не проверено, работают ли получатели: ${getErrorString(error)}`,
            );
            return reports;
        }
    }
}
