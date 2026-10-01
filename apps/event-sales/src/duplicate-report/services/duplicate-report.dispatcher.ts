import { Logger } from '@nestjs/common';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { BitrixService } from '@/modules/bitrix';
import { ETimeZone } from '@lib/shared/lib/date';
import { UserNameResolver } from '../../shared/lead-request/user-name.resolver';
import { fallbackWorkingHours } from '../../shared/working-hours/working-hours.model';
import { PortalWorkingHoursService } from '../../shared/working-hours/portal-working-hours.service';
import { buildDuplicateWorkbook } from '../excel/duplicate-excel.builder';
import { reportTaskDeadline } from '../lib/duplicate-report-schedule';
import {
    buildDuplicateTaskDescription,
    duplicateFileName,
    duplicateTaskTitle,
} from '../lib/duplicate-task-description';
import {
    DuplicateRecipientReport,
    DuplicateReportPeriod,
    DuplicateReportRunResult,
} from '../types/duplicate-report.types';
import {
    DuplicateReportDelivery,
    DuplicateTaskStorePort,
} from './duplicate-report-delivery';

/** Всё, что нужно рассылке помимо получателей. */
export interface DuplicateDispatchInput {
    readonly domain: string;
    readonly reports: readonly DuplicateRecipientReport[];
    readonly period: DuplicateReportPeriod;
    readonly timezone: ETimeZone;
    readonly now: Date;
    /** Владелец вебхука — постановщик задач и хозяин Диска для файлов. */
    readonly ownerId: number | null;
    readonly deadlineDays: number;
    /**
     * Пробный прогон одному человеку (ручка, `previewUserId`): прошлые
     * задачи остальных получателей не трогаются.
     */
    readonly preview?: boolean;
}

export type DuplicateDispatchResult = Pick<
    DuplicateReportRunResult,
    'tasksCreated' | 'tasksClosed'
>;

/**
 * Рассылка отчёта получателям: имена ответственных, срок задачи по
 * календарю портала, затем каждому — свой Excel и задача. Сбой одного
 * получателя — предупреждение, остальные получают отчёт.
 *
 * НЕ `@Injectable`: живёт один прогон, инстанс Битрикса — параметр
 * (CLAUDE.md); инфраструктурные сервисы приходят от вызывающего.
 */
export class DuplicateReportDispatcher {
    private readonly logger = new Logger(DuplicateReportDispatcher.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly taskStore: DuplicateTaskStorePort,
        private readonly userNames: Pick<UserNameResolver, 'resolve'>,
        private readonly workingHours: Pick<
            PortalWorkingHoursService,
            'resolve'
        >,
    ) {}

    async dispatch(
        input: DuplicateDispatchInput,
        warnings: string[],
    ): Promise<DuplicateDispatchResult> {
        const { domain, period } = input;
        const names = await this.names(input);
        const deadline = await this.deadline(input);
        const delivery = new DuplicateReportDelivery(
            this.bitrix,
            this.taskStore,
            domain,
        );
        let tasksCreated = 0;
        let tasksClosed = 0;
        for (const report of input.reports) {
            try {
                const file = await buildDuplicateWorkbook({
                    domain,
                    timezone: input.timezone,
                    period,
                    clients: report.clients,
                    userNames: names,
                });
                const outcome = await delivery.deliver(
                    {
                        userId: report.userId,
                        title: duplicateTaskTitle(period),
                        describe: fileAttached =>
                            buildDuplicateTaskDescription({
                                domain,
                                period,
                                report,
                                userNames: names,
                                fileAttached,
                            }),
                        fileName: duplicateFileName(
                            period,
                            names.get(report.userId) ?? null,
                        ),
                        file,
                    },
                    {
                        deadline,
                        timezone: input.timezone,
                        ownerId: input.ownerId,
                    },
                    warnings,
                );
                if (outcome.taskId) tasksCreated += 1;
                if (outcome.closedPrevious) tasksClosed += 1;
            } catch (error) {
                warnings.push(
                    `отчёт сотруднику ${report.userId} не собран: ${getErrorString(error)}`,
                );
            }
        }
        /*
         * Прошлые задачи тех, кому отчёта нет, закрываем, только когда
         * рассылка состоялась (или дублей нет вовсе): сбой Битрикса не
         * должен закрыть живые задачи со списком.
         */
        if (!input.preview && (tasksCreated > 0 || !input.reports.length)) {
            tasksClosed += await delivery.closeStale(
                input.reports.map(report => report.userId),
                warnings,
            );
        }
        return { tasksCreated, tasksClosed };
    }

    /** Имена ответственных и получателей; портал молчит — пусто. */
    private async names(
        input: DuplicateDispatchInput,
    ): Promise<Map<number, string>> {
        const ids = new Set<number>();
        for (const report of input.reports) {
            ids.add(report.userId);
            for (const client of report.clients) {
                for (const item of client.deals) {
                    if (item.deal.assignedById) ids.add(item.deal.assignedById);
                }
            }
        }
        const map = await this.userNames.resolve(input.domain, this.bitrix, [
            ...ids,
        ]);
        return new Map(
            Object.entries(map).map(([id, name]) => [Number(id), name]),
        );
    }

    /** Срок задачи по календарю портала; календарь недоступен — по дефолту. */
    private async deadline(input: DuplicateDispatchInput): Promise<Date> {
        let hours = fallbackWorkingHours();
        try {
            hours = (await this.workingHours.resolve(input.domain)).hours;
        } catch (error) {
            this.logger.warn(
                `[duplicate-report] ${input.domain}: календарь портала не прочитан — срок по графику пн–пт: ${getErrorString(error)}`,
            );
        }
        return reportTaskDeadline(
            hours,
            input.now,
            input.deadlineDays,
            input.timezone,
        );
    }
}
