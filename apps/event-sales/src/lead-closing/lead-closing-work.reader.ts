import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerTypeId } from '@lib/bitrix';

/** Открытая задача, привязанная к закрываемому лиду. */
export interface LeadClosingTask {
    id: number;
    title: string;
    responsibleId: number;
    /** UF_CRM_TASK как есть: L_*, D_*, C_*, CO_*, T{n}_*. */
    bindings: string[];
}

/** Открытое дело, где лид — владелец (не задача: те идут через задачи). */
export interface LeadClosingActivity {
    id: number;
    leadId: number;
    providerId: string;
    subject: string;
}

export interface LeadClosingWork {
    tasks: LeadClosingTask[];
    activities: LeadClosingActivity[];
}

const CHUNK = 50;
/** Ждёт контроля (4) и завершена (5) — для менеджера задача уже закрыта. */
const DONE_TASK_STATUSES = [4, 5];
/** «Ждёт контроля»: исполнитель завершил, постановщик ещё не принял. */
const AWAITING_CONTROL = 4;
const num = (value: unknown): number => Number(value ?? 0) || 0;

/**
 * Открытые задачи и дела лидов перед закрытием: Битрикс закрывает их вместе
 * с лидом (тест владельца, лид 359503, 13.11.2026), а при переезде задачи
 * переносились с привязкой и к лиду, и к сделке — закрытие лида закрыло бы
 * текущую работу менеджера в сделке.
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class LeadClosingWorkReader {
    constructor(private readonly bitrix: BitrixService) {}

    async read(leadIds: number[]): Promise<LeadClosingWork> {
        const tasks = new Map<number, LeadClosingTask>();
        const activities: LeadClosingActivity[] = [];
        for (let i = 0; i < leadIds.length; i += CHUNK) {
            const chunk = leadIds.slice(i, i + CHUNK);
            const { tasks: rows } = await this.bitrix.task.getAll(
                {
                    UF_CRM_TASK: chunk.map(id => `L_${id}`),
                    '!REAL_STATUS': DONE_TASK_STATUSES,
                },
                ['ID', 'TITLE', 'RESPONSIBLE_ID', 'UF_CRM_TASK'],
            );
            for (const row of rows) {
                tasks.set(num(row.id), {
                    id: num(row.id),
                    title: String(row.title ?? ''),
                    responsibleId: num(row.responsibleId),
                    bindings: (row.ufCrmTask ?? []).map(String),
                });
            }
            const { activities: acts } = await this.bitrix.activity.getAll(
                {
                    OWNER_TYPE_ID: BitrixOwnerTypeId.LEAD,
                    '@OWNER_ID': chunk,
                    COMPLETED: 'N',
                },
                ['ID', 'OWNER_ID', 'PROVIDER_ID', 'SUBJECT'],
            );
            for (const act of acts) {
                activities.push({
                    id: num(act.ID),
                    leadId: num(act.OWNER_ID),
                    providerId: String(act.PROVIDER_ID ?? ''),
                    subject: String(act.SUBJECT ?? ''),
                });
            }
        }
        return { tasks: [...tasks.values()], activities };
    }

    /**
     * Какие из закрытых задач встали в «Ждёт контроля» (4): у них контроль
     * постановщика, complete их не завершает.
     */
    async awaitingControl(taskIds: number[]): Promise<number[]> {
        const waiting: number[] = [];
        for (let i = 0; i < taskIds.length; i += CHUNK) {
            const { tasks } = await this.bitrix.task.getAll(
                {
                    ID: taskIds.slice(i, i + CHUNK),
                    REAL_STATUS: AWAITING_CONTROL,
                },
                ['ID'],
            );
            waiting.push(...tasks.map(task => num(task.id)));
        }
        return waiting;
    }
}
