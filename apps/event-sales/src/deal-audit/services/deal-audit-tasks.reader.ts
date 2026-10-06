import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { ETimeZone, parseBitrixField } from '@lib/shared/lib/date';
// См. комментарий в deal-audit-deals.reader: утилита event-report.
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
// Предстоящая = её ещё предстоит сделать («Ждёт контроля» — уже нет).
import { isPendingTaskStatus } from '../../shared/bitrix/open-task-statuses';
import { DealAuditTask } from '../types/deal-audit.types';

/** Селект: только то, что нужно правилам (дедлайн + статус). */
const TASK_SELECT = ['ID', 'DEADLINE', 'STATUS'];

/**
 * Самые ранние сроки первыми: Битрикс отдаёт не больше 50 задач на
 * сделку, и среди них обязана оказаться самая просроченная.
 */
const OLDEST_DEADLINE_FIRST = { deadline: 'ASC' } as const;

/**
 * Что считать открытой задачей уже на стороне Битрикса: не завершена и не
 * ждёт приёмки постановщиком («Ждёт контроля»). Такую задачу исполнитель
 * уже закрыл, о клиенте она никому не напомнит — считать её работой по
 * сделке значило бы прятать забытые сделки (разбор 05.10.2026: на портале
 * 7,5 тысячи задач в этом статусе).
 */
const OPEN_TASKS_FILTER = {
    '!REAL_STATUS': [
        EBXTaskStatus.SUPPOSEDLY_COMPLETED,
        EBXTaskStatus.COMPLETED,
    ],
};

type TaskRow = Record<string, unknown>;

const toRows = (raw: unknown): TaskRow[] =>
    Array.isArray(raw) ? (raw.filter(Boolean) as TaskRow[]) : [];

/** Сделка, по которой нужны задачи: её id и компания. */
export interface DealAuditTaskTarget {
    readonly dealId: number;
    readonly companyId: number | null;
}

/** Открытые задачи выбранных сделок. */
export class DealAuditTaskIndex {
    constructor(
        private readonly byDeal: ReadonlyMap<number, DealAuditTask[]>,
        /** Сколько задач прочитано — для лога прогона. */
        readonly total: number,
    ) {}

    /**
     * Задачи сделки: свои (`D_`) плюс задачи её компании (`CO_`).
     *
     * Компания учитывается потому, что холодный обзвон ставит задачу на
     * КОМПАНИЮ, а работа при этом идёт по сделке — без этого сделка в
     * работе выглядела бы «без задач».
     */
    forDeal(dealId: number): DealAuditTask[] {
        return this.byDeal.get(dealId) ?? [];
    }
}

const commandKey = (dealId: number): string => `audit_tasks_${dealId}`;

/**
 * Чтение открытых задач ВЫБРАННЫХ сделок.
 *
 * Раньше аудит вычитывал все открытые задачи портала (до 20 000, то есть
 * 400 страниц) и на большом портале всё равно видел только самые старые —
 * почти все сделки выходили «без задач». Теперь задачи читаются только по
 * сделкам, попавшим в прогон: одна команда на сделку, 50 команд в пачке.
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром конструктора
 * (CLAUDE.md — иначе гонка между порталами).
 */
export class DealAuditTasksReader {
    private readonly logger = new Logger(DealAuditTasksReader.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly timezone: ETimeZone,
    ) {}

    async loadFor(
        targets: readonly DealAuditTaskTarget[],
        warnings: string[],
    ): Promise<DealAuditTaskIndex> {
        const byDeal = new Map<number, DealAuditTask[]>();
        if (!targets.length) return new DealAuditTaskIndex(byDeal, 0);

        for (const target of targets) {
            this.bitrix.batch.task.getList(
                commandKey(target.dealId),
                {
                    ...OPEN_TASKS_FILTER,
                    UF_CRM_TASK: this.bindingsOf(target),
                },
                TASK_SELECT,
                OLDEST_DEADLINE_FIRST,
                // Общее число задач сделки не нужно — только сами задачи.
                -1,
            );
        }

        const results = await this.runBatch(warnings);
        let total = 0;
        let unread = 0;
        for (const target of targets) {
            const key = commandKey(target.dealId);
            if (!(key in results)) {
                unread += 1;
                continue;
            }
            const tasks = this.toTasks(results[key]);
            total += tasks.length;
            byDeal.set(target.dealId, tasks);
        }
        if (unread) {
            warnings.push(
                `задачи не прочитаны по сделкам: ${unread} — у них признак «без задач» может быть ложным`,
            );
        }
        this.logger.debug(`[deal-audit] прочитано задач: ${total}`);
        return new DealAuditTaskIndex(byDeal, total);
    }

    /** Привязки, по которым ищутся задачи сделки: она сама и её компания. */
    private bindingsOf(target: DealAuditTaskTarget): string[] {
        return target.companyId
            ? [`D_${target.dealId}`, `CO_${target.companyId}`]
            : [`D_${target.dealId}`];
    }

    /** Ответы пачек одной картой «ключ команды → значение». */
    private async runBatch(
        warnings: string[],
    ): Promise<Record<string, unknown>> {
        const merged: Record<string, unknown> = {};
        try {
            const responses = await this.bitrix.api.callBatchWithConcurrency(1);
            for (const response of responses) {
                Object.assign(merged, (response?.result ?? {}) as object);
            }
        } catch (error) {
            warnings.push(
                `tasks.task.list упал: ${(error as Error).message} — задачи не учтены`,
            );
        }
        return merged;
    }

    private toTasks(raw: unknown): DealAuditTask[] {
        const rows = toRows((raw as { tasks?: unknown } | null)?.tasks);
        const seen = new Set<number>();
        const tasks: DealAuditTask[] = [];
        for (const row of rows) {
            const task = this.toTask(row);
            if (!task || seen.has(task.id)) continue;
            seen.add(task.id);
            tasks.push(task);
        }
        return tasks;
    }

    private toTask(row: TaskRow): DealAuditTask | null {
        const id = Number(row['id'] ?? row['ID'] ?? 0);
        if (!Number.isFinite(id) || id <= 0) return null;
        const status = scalarText(row['status'] ?? row['STATUS']);
        if (!isPendingTaskStatus(status)) return null;
        const deadline = parseBitrixField(
            row['deadline'] ?? row['DEADLINE'],
            this.timezone,
        );
        return { id, deadlineAt: deadline ? deadline.valueOf() : null };
    }
}
