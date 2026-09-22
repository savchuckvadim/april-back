import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task';
import { IBatchGroupBuffer } from '../batch/batch-group-buffer.interface';

type BxRow = Record<string, unknown>;

/** Чью открытую работу перехватываем: лиды и сделки (поверхностно). */
export interface IWorkTakeoverScope {
    leadIds: number[];
    dealIds: number[];
}

export interface IWorkTakeoverTask {
    id: number;
    title: string;
    responsibleId: number | null;
}

export interface IWorkTakeoverActivity {
    id: number;
    subject: string;
    responsibleId: number | null;
}

/** Что нашлось у клиента — итог фазы чтения. */
export interface IWorkTakeoverPlan {
    tasks: IWorkTakeoverTask[];
    activities: IWorkTakeoverActivity[];
    warnings: string[];
}

export interface IWorkTakeoverOutcome {
    tasksMoved: number;
    activitiesMoved: number;
}

/**
 * Как читать портал: `batch` — через общую карту команд инстанса (только
 * когда в ней нет чужих команд: хуки, фаза чтения); `direct` — обычными
 * вызовами (одиночные ручки, где инстанс делят параллельные запросы).
 */
export type WorkTakeoverReadMode = 'batch' | 'direct';

export const EMPTY_WORK_TAKEOVER_PLAN: IWorkTakeoverPlan = {
    tasks: [],
    activities: [],
    warnings: [],
};

/** Дело-зеркало задачи: переезжает вместе с задачей, отдельно не трогаем. */
const TASK_ACTIVITY_PROVIDER = 'CRM_TASKS_TASK';

const OWNER_TYPE_LEAD = 1;
const OWNER_TYPE_DEAL = 2;

/** Задач/дел одного вида в одном перехвате — запас до лимита группы 50. */
const MAX_ITEMS_PER_KIND = 30;

const READ_PREFIX = 'wt_read';

const TASK_SELECT = ['ID', 'TITLE', 'RESPONSIBLE_ID', 'UF_CRM_TASK', 'STATUS'];
const ACTIVITY_SELECT = ['ID', 'SUBJECT', 'RESPONSIBLE_ID', 'PROVIDER_ID'];

interface IReadCommand {
    key: string;
    method: 'tasks.task.list' | 'crm.activity.list';
    params: BxRow;
}

/**
 * ПЕРЕХВАТ РАБОТЫ: открытые задачи и дела лида/сделки — новому ответственному.
 *
 * Случай 22.09.2026 (сделка 84879): лид с сайта создался на сотрудника из
 * «Не работающих», робот поставил ему задачу ХО, роботы сделки — задачи
 * третьему, а приняла заявку четвёртая. Ответственный сделки сменился, а
 * задачи и дела остались у прежних — в «Звонках» принявший их не видит.
 * Решение владельца: кто принял/получил работу, тот и забирает всё.
 *
 * Две фазы, как у всех хуков продаж (ai/rules/bitrix-batch-grouping.md):
 *  - {@link collect} — чтение; в режиме `batch` — одним проводом, поэтому
 *    звать строго до первой записи и без чужих команд в инстансе;
 *  - {@link queue} — запись через буфер вызывающего (хуки) либо
 *    {@link apply} — прямые вызовы (одиночная ручка принятия).
 *
 * Задача переезжает через `tasks.task.update` — её дело-зеркало в CRM
 * переезжает следом само, поэтому дела с провайдером задач пропускаются.
 * Не injectable: bitrix привязан к домену и приходит снаружи.
 */
export class WorkTakeoverService {
    private readonly logger = new Logger(WorkTakeoverService.name);

    constructor(private readonly bitrix: BitrixService) {}

    /** Фаза чтения: по одному плану на каждый охват, в том же порядке. */
    async collect(
        scopes: IWorkTakeoverScope[],
        mode: WorkTakeoverReadMode,
    ): Promise<IWorkTakeoverPlan[]> {
        const commands = scopes.map((scope, index) =>
            this.readCommands(scope, `${READ_PREFIX}_${index}`),
        );
        const flat = commands.flat();
        if (!flat.length) {
            return scopes.map(() => ({ ...EMPTY_WORK_TAKEOVER_PLAN }));
        }

        let responses: Map<string, unknown>;
        try {
            responses =
                mode === 'batch'
                    ? await this.readBatch(flat)
                    : await this.readDirect(flat);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.warn(
                `[takeover] чтение задач/дел не удалось — перехват пропущен: ${message}`,
            );
            return scopes.map(() => ({
                tasks: [],
                activities: [],
                warnings: [
                    `Задачи и дела не прочитаны (${message}) — остались у прежних ответственных`,
                ],
            }));
        }

        return commands.map(own => this.buildPlan(own, responses));
    }

    /** Фаза записи через буфер хука: только тем, у кого ответственный иной. */
    queue(
        buffer: Pick<IBatchGroupBuffer, 'queue'>,
        plan: IWorkTakeoverPlan,
        responsibleId: number,
        keyPrefix: string,
    ): IWorkTakeoverOutcome {
        const outcome: IWorkTakeoverOutcome = {
            tasksMoved: 0,
            activitiesMoved: 0,
        };
        if (!isId(responsibleId)) return outcome;

        for (const task of this.pending(plan.tasks, responsibleId)) {
            buffer.queue(() =>
                this.bitrix.batch.task.update(
                    `${keyPrefix}_task_${task.id}`,
                    task.id,
                    { RESPONSIBLE_ID: responsibleId },
                ),
            );
            outcome.tasksMoved += 1;
        }
        for (const activity of this.pending(plan.activities, responsibleId)) {
            buffer.queue(() =>
                this.bitrix.batch.activity.update(
                    `${keyPrefix}_act_${activity.id}`,
                    activity.id,
                    { RESPONSIBLE_ID: responsibleId },
                ),
            );
            outcome.activitiesMoved += 1;
        }
        return outcome;
    }

    /** Запись прямыми вызовами — для одиночных ручек вне буфера. */
    async apply(
        plan: IWorkTakeoverPlan,
        responsibleId: number,
    ): Promise<IWorkTakeoverOutcome> {
        const outcome: IWorkTakeoverOutcome = {
            tasksMoved: 0,
            activitiesMoved: 0,
        };
        if (!isId(responsibleId)) return outcome;

        for (const task of this.pending(plan.tasks, responsibleId)) {
            await this.bitrix.task.update(task.id, {
                RESPONSIBLE_ID: responsibleId,
            });
            outcome.tasksMoved += 1;
        }
        for (const activity of this.pending(plan.activities, responsibleId)) {
            await this.bitrix.activity.update(activity.id, {
                RESPONSIBLE_ID: responsibleId,
            });
            outcome.activitiesMoved += 1;
        }
        return outcome;
    }

    /* ------------------------------------------------------------------ */

    private readCommands(
        scope: IWorkTakeoverScope,
        prefix: string,
    ): IReadCommand[] {
        const commands: IReadCommand[] = [];
        const owners: { type: number; ref: 'L' | 'D'; ids: number[] }[] = [
            { type: OWNER_TYPE_LEAD, ref: 'L', ids: uniqueIds(scope.leadIds) },
            { type: OWNER_TYPE_DEAL, ref: 'D', ids: uniqueIds(scope.dealIds) },
        ];
        for (const owner of owners) {
            for (const id of owner.ids) {
                commands.push({
                    key: `${prefix}_t_${owner.ref}_${id}`,
                    method: 'tasks.task.list',
                    params: {
                        filter: {
                            UF_CRM_TASK: [`${owner.ref}_${id}`],
                            '!STATUS': EBXTaskStatus.COMPLETED,
                        },
                        select: TASK_SELECT,
                    },
                });
                commands.push({
                    key: `${prefix}_a_${owner.ref}_${id}`,
                    method: 'crm.activity.list',
                    params: {
                        filter: {
                            OWNER_TYPE_ID: owner.type,
                            OWNER_ID: id,
                            COMPLETED: 'N',
                        },
                        select: ACTIVITY_SELECT,
                    },
                });
            }
        }
        return commands;
    }

    private async readBatch(
        commands: IReadCommand[],
    ): Promise<Map<string, unknown>> {
        for (const command of commands) {
            this.bitrix.api.addCmdBatch(
                command.key,
                command.method,
                command.params,
            );
        }
        const responses = new Map<string, unknown>();
        for (const chunk of await this.bitrix.api.callBatchWithConcurrency(1)) {
            const result = (chunk?.result ?? {}) as Record<string, unknown>;
            for (const [key, value] of Object.entries(result)) {
                if (key.startsWith(READ_PREFIX)) responses.set(key, value);
            }
        }
        return responses;
    }

    private async readDirect(
        commands: IReadCommand[],
    ): Promise<Map<string, unknown>> {
        const responses = new Map<string, unknown>();
        for (const command of commands) {
            const response = (await this.bitrix.api.call(
                command.method,
                command.params,
            )) as { result?: unknown } | undefined;
            responses.set(command.key, response?.result);
        }
        return responses;
    }

    private buildPlan(
        commands: IReadCommand[],
        responses: Map<string, unknown>,
    ): IWorkTakeoverPlan {
        const plan: IWorkTakeoverPlan = {
            tasks: [],
            activities: [],
            warnings: [],
        };
        const seenTasks = new Set<number>();
        const seenActivities = new Set<number>();
        for (const command of commands) {
            const raw = responses.get(command.key);
            if (command.method === 'tasks.task.list') {
                for (const task of WorkTakeoverService.parseTasks(raw)) {
                    if (seenTasks.has(task.id)) continue;
                    seenTasks.add(task.id);
                    plan.tasks.push(task);
                }
                continue;
            }
            for (const activity of WorkTakeoverService.parseActivities(raw)) {
                if (seenActivities.has(activity.id)) continue;
                seenActivities.add(activity.id);
                plan.activities.push(activity);
            }
        }
        if (plan.tasks.length > MAX_ITEMS_PER_KIND) {
            plan.warnings.push(
                `Открытых задач ${plan.tasks.length} — перехвачены первые ${MAX_ITEMS_PER_KIND}`,
            );
            plan.tasks = plan.tasks.slice(0, MAX_ITEMS_PER_KIND);
        }
        if (plan.activities.length > MAX_ITEMS_PER_KIND) {
            plan.warnings.push(
                `Открытых дел ${plan.activities.length} — перехвачены первые ${MAX_ITEMS_PER_KIND}`,
            );
            plan.activities = plan.activities.slice(0, MAX_ITEMS_PER_KIND);
        }
        return plan;
    }

    /** Ответ `tasks.task.list` (`{tasks: []}`, поля в camelCase либо UPPER). */
    static parseTasks(raw: unknown): IWorkTakeoverTask[] {
        const container = raw as { tasks?: unknown } | undefined;
        const rows = rowsOf(Array.isArray(raw) ? raw : container?.tasks);
        const tasks: IWorkTakeoverTask[] = [];
        for (const row of rows) {
            const id = toId(row.id ?? row.ID);
            if (!id) continue;
            tasks.push({
                id,
                title: text(row.title ?? row.TITLE),
                responsibleId: toId(row.responsibleId ?? row.RESPONSIBLE_ID),
            });
        }
        return tasks;
    }

    /** Ответ `crm.activity.list` без зеркал задач. */
    static parseActivities(raw: unknown): IWorkTakeoverActivity[] {
        const activities: IWorkTakeoverActivity[] = [];
        for (const row of rowsOf(raw)) {
            const id = toId(row.ID);
            if (!id) continue;
            if (text(row.PROVIDER_ID) === TASK_ACTIVITY_PROVIDER) continue;
            activities.push({
                id,
                subject: text(row.SUBJECT),
                responsibleId: toId(row.RESPONSIBLE_ID),
            });
        }
        return activities;
    }

    private pending<T extends { responsibleId: number | null }>(
        items: T[],
        responsibleId: number,
    ): T[] {
        return items.filter(item => item.responsibleId !== responsibleId);
    }
}

const isId = (raw: unknown): raw is number =>
    typeof raw === 'number' && Number.isInteger(raw) && raw > 0;

const toId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const uniqueIds = (ids: readonly unknown[]): number[] => [
    ...new Set(ids.map(toId).filter((id): id is number => id !== null)),
];

const text = (raw: unknown): string =>
    typeof raw === 'string' ? raw.trim() : '';

const rowsOf = (value: unknown): BxRow[] => {
    if (Array.isArray(value)) {
        return value.filter(
            (row): row is BxRow => !!row && typeof row === 'object',
        );
    }
    if (value && typeof value === 'object') {
        const container = value as { items?: unknown; result?: unknown };
        if (Array.isArray(container.items)) return rowsOf(container.items);
        if (Array.isArray(container.result)) return rowsOf(container.result);
    }
    return [];
};
