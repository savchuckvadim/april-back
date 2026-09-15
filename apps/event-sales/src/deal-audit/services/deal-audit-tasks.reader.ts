import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { parseTaskCrmBinding } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { ETimeZone, parseBitrixField } from '@lib/shared/lib/date';
// См. комментарий в deal-audit-deals.reader: утилита event-report.
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
import { DealAuditTask } from '../types/deal-audit.types';

/** Страница `tasks.task.list` в Битриксе — 50 элементов, не меняется. */
const PAGE_SIZE = 50;
/** Команд в одном batch: больше Битрикс не принимает. */
const BATCH_SIZE = 50;
/**
 * Потолок вычитки задач за прогон. Не оптимизация, а предохранитель: на
 * портале с десятками тысяч открытых задач аудит иначе выедает лимиты
 * REST и мешает живой работе. Упёрлись — пишем warning, а не молчим.
 */
const MAX_TASKS = 20000;

/** Селект: только то, что нужно правилам (дедлайн + привязка). */
const TASK_SELECT = ['ID', 'DEADLINE', 'STATUS', 'UF_CRM_TASK'];

/**
 * Открытая задача = ещё делается. «Завершена» и «Отклонена» очевидно
 * закрыты, а «Отложена» сюда не попадает намеренно: отложенная задача
 * никому не напомнит о клиенте, и считать её работой значило бы прятать
 * ровно тот случай, ради которого аудит и заводится.
 */
const OPEN_STATUSES: readonly string[] = [
    EBXTaskStatus.NEW,
    EBXTaskStatus.PENDING,
    EBXTaskStatus.IN_PROGRESS,
    EBXTaskStatus.SUPPOSEDLY_COMPLETED,
];

type TaskRow = Record<string, unknown>;

const push = (
    map: Map<number, DealAuditTask[]>,
    key: number,
    task: DealAuditTask,
): void => {
    const list = map.get(key);
    if (list) list.push(task);
    else map.set(key, [task]);
};

const toRows = (raw: unknown): TaskRow[] =>
    Array.isArray(raw) ? (raw.filter(Boolean) as TaskRow[]) : [];

/**
 * Индекс открытых задач портала по привязкам CRM.
 *
 * Читается ОДИН раз на прогон, а не по задаче на сделку: тысяча сделок —
 * это тысяча вызовов `tasks.task.list`, что не проходит по лимитам REST.
 */
export class DealAuditTaskIndex {
    constructor(
        private readonly byDeal: ReadonlyMap<number, DealAuditTask[]>,
        private readonly byCompany: ReadonlyMap<number, DealAuditTask[]>,
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
    forDeal(dealId: number, companyId: number | null): DealAuditTask[] {
        const own = this.byDeal.get(dealId) ?? [];
        const company = companyId ? (this.byCompany.get(companyId) ?? []) : [];
        if (!company.length) return own;
        const seen = new Set(own.map(task => task.id));
        return [...own, ...company.filter(task => !seen.has(task.id))];
    }
}

/**
 * Чтение открытых задач портала для аудита.
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

    async load(warnings: string[]): Promise<DealAuditTaskIndex> {
        const rows = await this.fetchRows(warnings);
        const byDeal = new Map<number, DealAuditTask[]>();
        const byCompany = new Map<number, DealAuditTask[]>();
        let total = 0;

        for (const row of rows) {
            const task = this.toTask(row);
            if (!task) continue;
            total += 1;
            for (const binding of this.bindingsOf(row)) {
                const parsed = parseTaskCrmBinding(binding);
                if (!parsed) continue;
                const id = Number(parsed.id);
                if (!Number.isFinite(id) || id <= 0) continue;
                if (parsed.entity === 'DEAL') push(byDeal, id, task);
                if (parsed.entity === 'COMPANY') push(byCompany, id, task);
            }
        }
        return new DealAuditTaskIndex(byDeal, byCompany, total);
    }

    /** Первая страница синхронно, остальные — батчами по смещениям. */
    private async fetchRows(warnings: string[]): Promise<TaskRow[]> {
        const filter = { '!STATUS': EBXTaskStatus.COMPLETED };
        let head: { tasks?: unknown; total?: number };
        try {
            const response = await this.bitrix.task.getList(
                filter,
                TASK_SELECT,
                { id: 'ASC' },
                0,
            );
            head = (response?.result ?? {}) as typeof head;
        } catch (error) {
            warnings.push(
                `tasks.task.list упал: ${(error as Error).message} — задачи не учтены`,
            );
            return [];
        }

        const rows = toRows(head.tasks);
        const reported = Number(head.total ?? rows.length);
        const total = Math.min(reported, MAX_TASKS);
        if (reported > MAX_TASKS) {
            warnings.push(
                `открытых задач ${reported} — прочитаны первые ${MAX_TASKS}`,
            );
        }

        const offsets: number[] = [];
        for (let start = PAGE_SIZE; start < total; start += PAGE_SIZE) {
            offsets.push(start);
        }
        for (let i = 0; i < offsets.length; i += BATCH_SIZE) {
            const chunk = offsets.slice(i, i + BATCH_SIZE);
            for (const start of chunk) {
                this.bitrix.batch.task.getList(
                    `audit_tasks_${start}`,
                    filter,
                    TASK_SELECT,
                    { id: 'ASC' },
                    start,
                );
            }
            try {
                const responses =
                    await this.bitrix.api.callBatchWithConcurrency(1);
                for (const response of responses) {
                    const result = (response?.result ?? {}) as Record<
                        string,
                        unknown
                    >;
                    for (const value of Object.values(result)) {
                        rows.push(
                            ...toRows((value as { tasks?: unknown })?.tasks),
                        );
                    }
                }
            } catch (error) {
                warnings.push(
                    `страницы задач с ${chunk[0]} не прочитаны: ${(error as Error).message}`,
                );
                break;
            }
        }
        this.logger.debug(`[deal-audit] прочитано строк задач: ${rows.length}`);
        return rows;
    }

    private toTask(row: TaskRow): DealAuditTask | null {
        const id = Number(row['id'] ?? row['ID'] ?? 0);
        if (!Number.isFinite(id) || id <= 0) return null;
        const status = scalarText(row['status'] ?? row['STATUS']);
        if (!OPEN_STATUSES.includes(status)) return null;
        const deadline = parseBitrixField(
            row['deadline'] ?? row['DEADLINE'],
            this.timezone,
        );
        return { id, deadlineAt: deadline ? deadline.valueOf() : null };
    }

    /** `ufCrmTask` в ответе camelCase; UPPER — на случай старой сборки. */
    private bindingsOf(row: TaskRow): string[] {
        const raw = row['ufCrmTask'] ?? row['UF_CRM_TASK'];
        if (Array.isArray(raw)) return raw.map(String);
        return typeof raw === 'string' && raw ? [raw] : [];
    }
}
