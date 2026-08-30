import { FlowBitrix } from '../side-flow.types';
import { SideFlowTaskBinderService } from '../side-flow-task-binder.service';

/**
 * Привязка элемента смарта к задаче (`UF_CRM_TASK`).
 *
 * Правила раздела: чужие привязки (`D_100`, `CO_431`) сохраняются, свою
 * ссылку `T{hex}_{id}` повторный джоб не дублирует, а любая ошибка
 * Битрикса джоб НЕ роняет — привязка это украшение, элемент уже записан.
 * Отдельно проверяется имя потока в логе: сервис общий на две очереди, и
 * без него по отказу не понять, чей отчёт не привязал элемент.
 */
const ENTITY_TYPE_ID = 1038; // hex 40e — ровно как в живом смарте ЗПР
const ELEMENT_ID = 501;
const REF = 'T40e_501';
const TASK_ID = 77;

const makeHarness = (over?: {
    /** Что отдаёт tasks.task.get; undefined — задача без привязок. */
    task?: Record<string, unknown>;
    /** Чтение задачи падает — самый частый отказ (нет прав/задача снесена). */
    getFails?: boolean;
}) => {
    const updates: Array<{ id: number; fields: Record<string, unknown> }> = [];

    const bitrix = {
        task: {
            get: () => {
                if (over?.getFails) {
                    return Promise.reject(new Error('битрикс недоступен'));
                }
                return Promise.resolve({
                    result: { task: over?.task ?? { id: TASK_ID } },
                });
            },
            update: (id: number, fields: Record<string, unknown>) => {
                updates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
    } as unknown as FlowBitrix;

    const binder = new SideFlowTaskBinderService();
    const warn = jest
        .spyOn(binder['logger'], 'warn')
        .mockImplementation(() => undefined);

    return { binder, bitrix, updates, warn };
};

describe('SideFlowTaskBinderService', () => {
    it('дописывает ссылку на элемент, сохраняя чужие привязки задачи', async () => {
        const { binder, bitrix, updates } = makeHarness({
            task: { ufCrmTask: ['D_100', 'CO_431'] },
        });

        await binder.bind(bitrix, TASK_ID, ENTITY_TYPE_ID, ELEMENT_ID);

        expect(updates).toHaveLength(1);
        expect(updates[0].id).toBe(TASK_ID);
        expect(updates[0].fields).toEqual({
            UF_CRM_TASK: ['D_100', 'CO_431', REF],
        });
    });

    /*
     * Bull доставляет at-least-once: упавший после записи воркер отдаст
     * джоб заново. Второй такой же строкой владелец увидел бы дубль
     * прямо в карточке задачи.
     */
    it('повторный джоб не дописывает ту же ссылку вторым элементом', async () => {
        const { binder, bitrix, updates } = makeHarness({
            task: { ufCrmTask: ['D_100', REF] },
        });

        await binder.bind(bitrix, TASK_ID, ENTITY_TYPE_ID, ELEMENT_ID);

        expect(updates).toHaveLength(0);
    });

    it('читает привязки в camelCase — так их отдаёт tasks.task.get', async () => {
        const { binder, bitrix, updates } = makeHarness({
            task: { ufCrmTask: ['L_42'] },
        });

        await binder.bind(bitrix, TASK_ID, ENTITY_TYPE_ID, ELEMENT_ID);

        expect(updates[0].fields).toEqual({ UF_CRM_TASK: ['L_42', REF] });
    });

    it('читает привязки и в UPPER-регистре (UF_CRM_TASK)', async () => {
        const { binder, bitrix, updates } = makeHarness({
            task: { UF_CRM_TASK: ['L_42'] },
        });

        await binder.bind(bitrix, TASK_ID, ENTITY_TYPE_ID, ELEMENT_ID);

        expect(updates[0].fields).toEqual({ UF_CRM_TASK: ['L_42', REF] });
    });

    it('задача без привязок получает единственную ссылку на элемент', async () => {
        const { binder, bitrix, updates } = makeHarness();

        await binder.bind(bitrix, TASK_ID, ENTITY_TYPE_ID, ELEMENT_ID);

        expect(updates[0].fields).toEqual({ UF_CRM_TASK: [REF] });
    });

    /*
     * Элемент смарта на этот момент уже записан: уронить джоб из-за
     * несостоявшегося украшения значило бы отдать его на повтор и
     * рискнуть вторым элементом.
     */
    it('ошибка чтения задачи не роняет джоб и уходит в warn', async () => {
        const { binder, bitrix, updates, warn } = makeHarness({
            getFails: true,
        });

        await expect(
            binder.bind(bitrix, TASK_ID, ENTITY_TYPE_ID, ELEMENT_ID),
        ).resolves.toBeUndefined();

        expect(updates).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(REF));
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('битрикс недоступен'),
        );
    });

    /*
     * До переезда правила в общий раздел канал грепался по потоку
     * (`[zpr-flow]`, `[pres-flow]`). Общий префикс это отнял, поэтому
     * поток передаётся аргументом и обязан доезжать до строки лога.
     */
    it('пишет в лог имя потока, который звал привязку', async () => {
        const { binder, bitrix, warn } = makeHarness({ getFails: true });

        await binder.bind(
            bitrix,
            TASK_ID,
            ENTITY_TYPE_ID,
            ELEMENT_ID,
            'zpr-flow',
        );

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('[zpr-flow] привязка элемента'),
        );
    });

    // Легаси-вызов без имени потока: лог менее точен, привязка та же.
    it('без имени потока остаётся общий префикс [side-flow]', async () => {
        const { binder, bitrix, warn } = makeHarness({ getFails: true });

        await binder.bind(bitrix, TASK_ID, ENTITY_TYPE_ID, ELEMENT_ID);

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('[side-flow] привязка элемента'),
        );
    });
});
