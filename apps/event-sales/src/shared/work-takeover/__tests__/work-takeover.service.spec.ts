import { WorkTakeoverService } from '../work-takeover.service';

type Row = Record<string, unknown>;

/** Задачи ХО и роботов из сделки 84879 (22.09.2026) — на трёх разных людях. */
const TASKS: Row[] = [
    { id: '757785', title: 'Холодный обзвон. Заявка.', responsibleId: '171' },
    { id: '757783', title: 'Выявить потребность', responsibleId: '325' },
    { id: '757871', title: 'Звонок отказ 1', responsibleId: '323' },
];

const ACTIVITIES: Row[] = [
    {
        ID: '2851993',
        SUBJECT: 'Поставить оценку',
        RESPONSIBLE_ID: '325',
        PROVIDER_ID: 'CRM_TODO',
    },
    // Зеркало задачи — переезжает вместе с задачей, отдельно не трогаем.
    {
        ID: '2851995',
        SUBJECT: 'Выявить потребность',
        RESPONSIBLE_ID: '325',
        PROVIDER_ID: 'CRM_TASKS_TASK',
    },
];

const makeBitrix = (tasks = TASKS, activities = ACTIVITIES) => {
    const call = jest.fn((method: string) =>
        Promise.resolve(
            method === 'tasks.task.list'
                ? { result: { tasks } }
                : { result: activities },
        ),
    );
    const addCmdBatch = jest.fn<undefined, [string, string, Row]>();
    const callBatchWithConcurrency = jest.fn(() =>
        Promise.resolve([
            {
                result: {
                    wt_read_0_t_L_5: { tasks },
                    wt_read_0_a_L_5: activities,
                    wt_read_0_t_D_9: { tasks: [] },
                    wt_read_0_a_D_9: [],
                    // Чужой ответ в том же проводе — не наш, игнорируется.
                    foreign_cmd: [{ ID: '1' }],
                },
            },
        ]),
    );
    const taskUpdate = jest
        .fn<Promise<unknown>, [number, Row]>()
        .mockResolvedValue({});
    const activityUpdate = jest
        .fn<Promise<unknown>, [number, Row]>()
        .mockResolvedValue({});
    const batchTaskUpdate = jest.fn<undefined, [string, number, Row]>();
    const batchActivityUpdate = jest.fn<undefined, [string, number, Row]>();
    const bitrix = {
        api: { call, addCmdBatch, callBatchWithConcurrency },
        task: { update: taskUpdate },
        activity: { update: activityUpdate },
        batch: {
            task: { update: batchTaskUpdate },
            activity: { update: batchActivityUpdate },
        },
    };
    return {
        bitrix,
        call,
        addCmdBatch,
        taskUpdate,
        activityUpdate,
        batchTaskUpdate,
        batchActivityUpdate,
    };
};

/** Буфер хука: колбэки выполняем сразу — проверяем, что в них попало. */
const makeBuffer = () => ({
    queue: jest.fn((enqueue: () => void) => enqueue()),
});

describe('WorkTakeoverService', () => {
    it('direct: читает задачи и дела лида/сделок и переводит чужие принявшему', async () => {
        const { bitrix, call, taskUpdate, activityUpdate } = makeBitrix();
        const service = new WorkTakeoverService(bitrix as never);

        const [plan] = await service.collect(
            [{ leadIds: [5], dealIds: [9, 9] }],
            'direct',
        );
        // Лид + одна сделка (дубль id схлопнут): по два чтения на владельца.
        expect(call).toHaveBeenCalledTimes(4);
        expect(plan.tasks.map(task => task.id)).toEqual([
            757785, 757783, 757871,
        ]);
        // Зеркало задачи выкинуто, осталось одно настоящее дело.
        expect(plan.activities.map(activity => activity.id)).toEqual([2851993]);

        const outcome = await service.apply(plan, 323);
        // Задача, уже стоящая на принявшей, не трогается.
        expect(taskUpdate.mock.calls.map(([id]) => id)).toEqual([
            757785, 757783,
        ]);
        expect(taskUpdate).toHaveBeenCalledWith(757785, {
            RESPONSIBLE_ID: 323,
        });
        expect(activityUpdate).toHaveBeenCalledWith(2851993, {
            RESPONSIBLE_ID: 323,
        });
        expect(outcome).toEqual({ tasksMoved: 2, activitiesMoved: 1 });
    });

    it('batch: чтение одним проводом со своими ключами, запись через буфер', async () => {
        const { bitrix, addCmdBatch, batchTaskUpdate, batchActivityUpdate } =
            makeBitrix();
        const service = new WorkTakeoverService(bitrix as never);

        const [plan] = await service.collect(
            [{ leadIds: [5], dealIds: [9] }],
            'batch',
        );
        expect(addCmdBatch.mock.calls.map(([key]) => key)).toEqual([
            'wt_read_0_t_L_5',
            'wt_read_0_a_L_5',
            'wt_read_0_t_D_9',
            'wt_read_0_a_D_9',
        ]);
        expect(plan.tasks).toHaveLength(3);
        expect(plan.activities).toHaveLength(1);

        const buffer = makeBuffer();
        const outcome = service.queue(buffer, plan, 323, 'la_to_5');
        expect(outcome).toEqual({ tasksMoved: 2, activitiesMoved: 1 });
        expect(batchTaskUpdate).toHaveBeenCalledWith(
            'la_to_5_task_757785',
            757785,
            {
                RESPONSIBLE_ID: 323,
            },
        );
        expect(batchActivityUpdate).toHaveBeenCalledWith(
            'la_to_5_act_2851993',
            2851993,
            { RESPONSIBLE_ID: 323 },
        );
    });

    it('несколько охватов — по плану на каждый, в том же порядке', async () => {
        const { bitrix } = makeBitrix();
        const service = new WorkTakeoverService(bitrix as never);
        const plans = await service.collect(
            [
                { leadIds: [], dealIds: [] },
                { leadIds: [5], dealIds: [] },
            ],
            'direct',
        );
        expect(plans).toHaveLength(2);
        expect(plans[0].tasks).toEqual([]);
        expect(plans[1].tasks).toHaveLength(3);
    });

    it('сбой чтения — пустой план с предупреждением, а не исключение', async () => {
        const { bitrix, call } = makeBitrix();
        call.mockRejectedValue(new Error('portal down'));
        const service = new WorkTakeoverService(bitrix as never);

        const [plan] = await service.collect(
            [{ leadIds: [5], dealIds: [] }],
            'direct',
        );
        expect(plan.tasks).toEqual([]);
        expect(plan.warnings.join(' ')).toContain('portal down');
    });

    it('без ответственного ничего не пишет', async () => {
        const { bitrix, taskUpdate } = makeBitrix();
        const service = new WorkTakeoverService(bitrix as never);
        const [plan] = await service.collect(
            [{ leadIds: [5], dealIds: [] }],
            'direct',
        );
        expect(await service.apply(plan, 0)).toEqual({
            tasksMoved: 0,
            activitiesMoved: 0,
        });
        expect(taskUpdate).not.toHaveBeenCalled();
    });

    it('разбор задач понимает и camelCase, и UPPER-поля', () => {
        expect(
            WorkTakeoverService.parseTasks({
                tasks: [
                    { ID: '1', TITLE: 'a', RESPONSIBLE_ID: '7' },
                    { id: '2', title: 'b', responsibleId: '8' },
                    { id: 'мусор' },
                ],
            }),
        ).toEqual([
            { id: 1, title: 'a', responsibleId: 7 },
            { id: 2, title: 'b', responsibleId: 8 },
        ]);
    });
});
