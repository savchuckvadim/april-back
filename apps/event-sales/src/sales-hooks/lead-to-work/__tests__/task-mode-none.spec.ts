import { TaskFlowService } from '../services/flows/task-flow.service';

/**
 * Режим `none`: конвертация переносит работу, а следующий шаг менеджер
 * ставит сам — автозадача «Звонок» в списке только шумит.
 */
const makeDeps = () => {
    const calls: string[] = [];
    const bitrix = {
        batch: {
            task: {
                add: (cmd: string) => calls.push(`add:${cmd}`),
                update: (cmd: string) => calls.push(`update:${cmd}`),
                complete: (cmd: string) => calls.push(`complete:${cmd}`),
            },
        },
    };
    const portal = { getSalesTaskGroupId: () => 5 };
    const buffer = { queue: (fn: () => unknown) => fn() };
    return { calls, bitrix, portal, buffer };
};

const input = {
    eventName: 'ООО Ромашка',
    xoTitle: 'Холодный обзвон. ООО Ромашка',
    companyRef: null,
    dealRef: '$result[deal]',
    xoRef: null,
};

const item = (over: Record<string, unknown> = {}) =>
    ({
        leadId: 42,
        responsible: 7,
        taskMode: 'none',
        isXo: 'N',
        createCompany: 'N',
        stageMode: 'from_lead',
        ...over,
    }) as never;

describe('TaskFlowService: режим none', () => {
    it('нет открытых задач → новая НЕ создаётся', () => {
        const { calls, bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        const result = service.queue(
            item(),
            { openTasks: [] } as never,
            input,
            buffer as never,
        );

        expect(calls).toEqual([]);
        expect(result.addCmd).toBeUndefined();
        expect(result.tasksMoved).toBe(0);
    });

    it('открытые задачи есть → не переносятся и не закрываются', () => {
        const { calls, bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        const result = service.queue(
            item(),
            { openTasks: [{ id: 100 }, { id: 101 }] } as never,
            input,
            buffer as never,
        );

        expect(calls).toEqual([]);
        expect(result.tasksMoved).toBe(0);
        expect(result.tasksClosed).toBe(0);
    });

    /* ХО без задачи обзвона — законно, но человек должен об этом узнать. */
    it('none в ХО-ветке → предупреждение', () => {
        const { bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        const result = service.queue(
            item({ isXo: 'Y' }),
            { openTasks: [] } as never,
            input,
            buffer as never,
        );

        expect(result.warnings.join(' ')).toContain(
            'задача обзвона не создана',
        );
    });

    it('move при нуле задач по-прежнему создаёт новую (регрессия)', () => {
        const { calls, bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        const result = service.queue(
            item({ taskMode: 'move' }),
            { openTasks: [] } as never,
            input,
            buffer as never,
        );

        expect(result.addCmd).toBe('lw_task_add_42');
        expect(calls).toEqual(['add:lw_task_add_42']);
    });
});
