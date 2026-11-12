import { IBXDeal } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task';
import { hasCrmLink } from '@lib/portal-lib/pbx/const-smart-registry';
import { toLinkedIds } from '../../../cold-hook-v2/lib/deal-link-fields';
import { SmartRow } from '../../../cold-hook-v2/services/relations/cold-relations.types';
import { ClientTakeover, isTakeoverOwner } from './client-takeover';

/** Роль закрываемой сделки — от неё зависит стадия закрытия. */
export type TakeoverCloseRole = 'base' | 'xo' | 'pres';

/** Что сделать с чужой работой по клиенту. */
export interface TakeoverCleanupPlan {
    /** Задачи забранной сделки — переходят отчитавшемуся (звонок коллеги — его звонок). */
    reassignTaskIds: number[];
    /** Прочие задачи перехватываемых сотрудников — закрываются. */
    completeTaskIds: number[];
    closeDeals: { deal: IBXDeal; role: TakeoverCloseRole }[];
    closePresIds: number[];
    closeZprIds: number[];
}

export interface TakeoverCleanupInput {
    takeover: ClientTakeover;
    /** Открытые сделки клиента ОП/ТМЦ (сборщик холодного старта). */
    deals: readonly IBXDeal[];
    /** Открытые задачи группы продаж по клиенту. */
    tasks: readonly IBXTask[];
    presRows: readonly SmartRow[];
    zprRows: readonly SmartRow[];
    /** Битрикс-id воронок ОП; прочие воронки (ТМЦ, ОС, свои) не трогаются. */
    categoryIds: {
        base: string | null;
        xo: string | null;
        pres: string | null;
    };
    /** UF-ключ `to_base_sales` — сделки, привязанные к защищённым. */
    linkKey: string;
    /** Сделки, которые обновляет сам отчёт (основная, ХО, презентация, ТМЦ). */
    keepDealIds: ReadonlySet<number>;
    /** Задача, по которой отчитываются: её закрывает сам отчёт. */
    currentTaskId: number | null;
    /** UF-ключи связи элемента смарта со сделкой (`PRES_BASE_DEAL`, `PRES_DEAL`…). */
    presLinkKeys: readonly string[];
    zprLinkKeys: readonly string[];
}

const id = (raw: unknown): number => {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : 0;
};

const taskField = (task: IBXTask, camel: string, upper: string): unknown => {
    const row = task as unknown as Record<string, unknown>;
    return row[camel] ?? row[upper];
};

const taskDealIds = (task: IBXTask): number[] => {
    const raw = taskField(task, 'ufCrmTask', 'UF_CRM_TASK');
    const bindings = Array.isArray(raw) ? raw.map(String) : [];
    return bindings
        .filter(binding => /^D_\d+$/.test(binding))
        .map(binding => Number(binding.slice(2)));
};

/**
 * Чужая работа по клиенту при перехвате — ЧИСТЫЙ расчёт без вызовов.
 *
 *  - сделки воронок ОП (основная, ХО, презентации) перехватываемых
 *    сотрудников закрываются; не трогаются: своя работа отчитавшегося,
 *    сделки, которые обновляет сам отчёт, защищённые сделки и всё, что на
 *    них ссылается, любые другие воронки;
 *  - задачи забранной сделки переходят отчитавшемуся, прочие задачи
 *    перехватываемых сотрудников закрываются — кроме привязанных к
 *    сохраняемым сделкам (защищённая сделка коллеги живёт со своими задачами);
 *  - элементы «Презентаций» и «ЗПР» перехватываемых сотрудников закрываются,
 *    как при холодном обзвоне «с очищением» (решение владельца 12.11.2026),
 *    кроме привязанных к защищённым сделкам.
 */
export const planTakeoverCleanup = (
    input: TakeoverCleanupInput,
): TakeoverCleanupPlan => {
    const { takeover } = input;
    const takeable = (ownerId: number): boolean =>
        isTakeoverOwner(takeover, ownerId);

    const protectedIds = new Set(
        takeover.protectedDeals.map(deal => id(deal.ID)),
    );
    for (const deal of input.deals) {
        const refs = toLinkedIds(
            (deal as unknown as Record<string, unknown>)[input.linkKey],
            /^D_/i,
        );
        if (refs.some(ref => protectedIds.has(ref)))
            protectedIds.add(id(deal.ID));
    }

    const roleOf = (deal: IBXDeal): TakeoverCloseRole | null => {
        const category = String(deal.CATEGORY_ID);
        if (category === input.categoryIds.base) return 'base';
        if (category === input.categoryIds.xo) return 'xo';
        if (category === input.categoryIds.pres) return 'pres';
        return null;
    };
    const closeDeals: TakeoverCleanupPlan['closeDeals'] = [];
    for (const deal of input.deals) {
        const dealId = id(deal.ID);
        const role = roleOf(deal);
        if (
            !role ||
            input.keepDealIds.has(dealId) ||
            protectedIds.has(dealId)
        ) {
            continue;
        }
        if (takeable(id(deal.ASSIGNED_BY_ID))) closeDeals.push({ deal, role });
    }

    const takenId = id(takeover.takenDeal?.ID);
    const keepForTasks = new Set(
        [...input.keepDealIds, ...protectedIds].filter(
            dealId => dealId !== takenId,
        ),
    );
    const reassignTaskIds: number[] = [];
    const completeTaskIds: number[] = [];
    for (const task of input.tasks) {
        const taskId = id(taskField(task, 'id', 'ID'));
        if (!taskId || taskId === input.currentTaskId) continue;
        if (!takeable(id(taskField(task, 'responsibleId', 'RESPONSIBLE_ID')))) {
            continue;
        }
        const dealIds = taskDealIds(task);
        if (takenId && dealIds.includes(takenId)) {
            reassignTaskIds.push(taskId);
        } else if (!dealIds.some(dealId => keepForTasks.has(dealId))) {
            completeTaskIds.push(taskId);
        }
    }

    const closableRows = (
        rows: readonly SmartRow[],
        linkKeys: readonly string[],
    ): number[] =>
        rows
            .filter(row => takeable(id(row['assignedById'])))
            .filter(
                row =>
                    ![...protectedIds].some(dealId =>
                        linkKeys.some(key => hasCrmLink(row[key], 'D', dealId)),
                    ),
            )
            .map(row => id(row['id']))
            .filter(Boolean);

    return {
        reassignTaskIds,
        completeTaskIds,
        closeDeals,
        closePresIds: closableRows(input.presRows, input.presLinkKeys),
        closeZprIds: closableRows(input.zprRows, input.zprLinkKeys),
    };
};
