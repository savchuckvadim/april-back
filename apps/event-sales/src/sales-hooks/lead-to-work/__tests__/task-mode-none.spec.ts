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

/**
 * Режим `move_keep` — массовый перенос исторической базы: существующие
 * задачи переезжают на сделку, но НОВЫХ хук не плодит. Разведка портала
 * 15.09.2026 показала, что открытые задачи есть далеко не у всех лидов
 * волны, и обычный `move` поставил бы менеджерам тысячи «Звонков» разом.
 */
describe('TaskFlowService: режим move_keep', () => {
    it('нет открытых задач → новая НЕ создаётся (в отличие от move)', () => {
        const { calls, bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        const result = service.queue(
            item({ taskMode: 'move_keep' }),
            { openTasks: [] } as never,
            input,
            buffer as never,
        );

        expect(calls).toEqual([]);
        expect(result.addCmd).toBeUndefined();
        expect(result.tasksMoved).toBe(0);
    });

    it('открытые задачи есть → переносятся, как при move', () => {
        const { calls, bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        const result = service.queue(
            item({ taskMode: 'move_keep' }),
            { openTasks: [{ id: 100 }, { id: 101 }] } as never,
            input,
            buffer as never,
        );

        expect(calls).toEqual([
            'update:lw_task_move_100',
            'update:lw_task_move_101',
        ]);
        expect(result.tasksMoved).toBe(2);
        expect(result.tasksClosed).toBe(0);
        expect(result.addCmd).toBeUndefined();
    });

    /* ХО всегда закрывает и ставит свою задачу — режим тут не решает. */
    it('ХО-ветка сильнее move_keep: задачи закрываются, новая ставится', () => {
        const { calls, bitrix, portal, buffer } = makeDeps();
        const service = new TaskFlowService(bitrix as never, portal as never);

        const result = service.queue(
            item({ taskMode: 'move_keep', isXo: 'Y' }),
            { openTasks: [{ id: 100 }] } as never,
            input,
            buffer as never,
        );

        expect(result.tasksClosed).toBe(1);
        expect(result.addCmd).toBe('lw_task_add_42');
        expect(calls).toContain('add:lw_task_add_42');
    });
});
