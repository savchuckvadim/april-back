import { DealAuditDigestService } from '../services/deal-audit-digest.service';
import { DEAL_AUDIT_STATUS } from '../constants/deal-audit.const';
import { DealAuditVerdict } from '../types/deal-audit.types';
import { DEFAULT_DIGEST_CHANNELS } from '../lib/deal-audit-digest-channels';
import { DEAL_AUDIT_TASK_MARK } from '../services/deal-audit-digest-task';

const DOMAIN = 'garant.bitrix24.ru';

const users = (...ids: number[]) =>
    ids.map(ID => ({ ID, NAME: `Имя${ID}`, LAST_NAME: `Фамилия${ID}` }));

/** Снимок отдела как на garant: ОП, их группы и предки ОП. */
const SNAPSHOT = {
    department: {
        department: 0,
        generalDepartment: [
            { ID: 63, PARENT: 79, HEADS: [11], USERS: users(11, 69) },
            { ID: 37, PARENT: 81, HEADS: [413], USERS: users(413, 500) },
        ],
        childrenDepartments: [{ ID: 67, PARENT: 63, USERS: users(323) }],
        parentDepartments: [
            { ID: 1, HEADS: [1], USERS: users(1) },
            { ID: 79, PARENT: 1, HEADS: [309], USERS: users(309) },
            { ID: 81, PARENT: 1, USERS: users(81) },
        ],
        allUsers: [],
    },
};

/** Забытая сделка сотрудника: `#id` — её номер в тексте сводки. */
const forgotten = (dealId: number, assignedById: number): DealAuditVerdict => ({
    dealId,
    title: 'Клиент',
    assignedById,
    status: DEAL_AUDIT_STATUS.idle,
    flags: [],
    idleDays: 20,
    overdueDays: 0,
    stageDays: 10,
    openTasks: 0,
    comment: 'без работы 20 дн.',
});

const VERDICTS = [
    forgotten(1069, 69),
    forgotten(1323, 323),
    forgotten(1500, 500),
];

/** Тесты адресатов читают уведомления: в них один текст на получателя. */
const NOTIFY_ONLY = { notify: true, message: false, task: false };

const NO_RECIPIENTS = {
    toManager: false,
    toHead: false,
    userIds: [],
    departmentUserIds: [],
    excludeUserIds: [],
    limit: 20,
    channels: NOTIFY_ONLY,
};

const makeService = (
    structure: 'ok' | 'down' = 'ok',
    /** Открытые задачи-сводки получателя на портале (для замены). */
    previousTasks: Array<{ id: number; status: string }> = [],
) => {
    const systemAdd = jest.fn().mockResolvedValue(true);
    const messageAdd = jest.fn().mockResolvedValue({ result: 1 });
    const taskAdd = jest.fn().mockResolvedValue({
        result: { task: { id: 900 } },
    });
    const taskComplete = jest.fn().mockResolvedValue({ result: true });
    const taskGetList = jest.fn().mockResolvedValue({
        result: {
            tasks: previousTasks.map(t => ({ id: t.id, status: t.status })),
        },
    });
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                imNotify: { systemAdd },
                message: { add: messageAdd },
                task: {
                    add: taskAdd,
                    complete: taskComplete,
                    getList: taskGetList,
                },
            },
            PortalModel: { getTimezone: () => 'Europe/Moscow' },
        }),
    };
    const departments = {
        getFullDepartment:
            structure === 'ok'
                ? jest.fn().mockResolvedValue(SNAPSHOT)
                : jest.fn().mockRejectedValue(new Error('portal down')),
    };
    const service = new DealAuditDigestService(
        pbx as never,
        departments as never,
    );
    /** Текст уведомления по получателю. */
    const sentTo = (userId: number): string | undefined =>
        (systemAdd.mock.calls as [{ USER_ID: number; MESSAGE: string }][]).find(
            ([payload]) => payload.USER_ID === userId,
        )?.[0].MESSAGE;
    return {
        service,
        systemAdd,
        messageAdd,
        taskAdd,
        taskComplete,
        taskGetList,
        sentTo,
    };
};

describe('DealAuditDigestService', () => {
    it('сводка по своему отделу: «Глава Воронеж» видит ОП и группу, но не СПб', async () => {
        const { service, sentTo } = makeService();

        const sent = await service.send(
            DOMAIN,
            VERDICTS,
            { ...NO_RECIPIENTS, departmentUserIds: [309] },
            [],
        );

        expect(sent).toBe(1);
        const message = sentTo(309) ?? '';
        expect(message).toContain('Забытые сделки вашего отдела');
        expect(message).toContain('#1069');
        expect(message).toContain('#1323');
        expect(message).not.toContain('#1500');
        // Сводка руководителя — с подписью ответственного.
        expect(message).toContain('Фамилия69 Имя69');
    });

    it('сводка по всей структуре — всем получателям, подчинённые не нужны', async () => {
        const { service, sentTo } = makeService();

        await service.send(
            DOMAIN,
            VERDICTS,
            { ...NO_RECIPIENTS, userIds: [447] },
            [],
        );

        const message = sentTo(447) ?? '';
        expect(message).toContain('по всем отделам');
        expect(message).toContain('#1069');
        expect(message).toContain('#1500');
    });

    it('исключённые сотрудники не попадают ни в одну сводку', async () => {
        const { service, sentTo } = makeService();

        await service.send(
            DOMAIN,
            VERDICTS,
            {
                ...NO_RECIPIENTS,
                userIds: [447],
                departmentUserIds: [309],
                excludeUserIds: [69],
            },
            [],
        );

        expect(sentTo(447)).not.toContain('#1069');
        expect(sentTo(309)).not.toContain('#1069');
        expect(sentTo(309)).toContain('#1323');
    });

    it('в своём отделе забытых нет — получателю ничего не уходит', async () => {
        const { service, systemAdd } = makeService();

        const sent = await service.send(
            DOMAIN,
            [forgotten(1500, 500)],
            { ...NO_RECIPIENTS, departmentUserIds: [309] },
            [],
        );

        expect(sent).toBe(0);
        expect(systemAdd).not.toHaveBeenCalled();
    });

    it('структура не прочитана — предупреждение, общая сводка всё равно уходит', async () => {
        const { service, sentTo } = makeService('down');
        const warnings: string[] = [];

        await service.send(
            DOMAIN,
            VERDICTS,
            { ...NO_RECIPIENTS, userIds: [447], departmentUserIds: [309] },
            warnings,
        );

        expect(sentTo(447)).toContain('#1069');
        expect(sentTo(309)).toBeUndefined();
        expect(warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'сводка по своему отделу не отправлена',
                ),
            ]),
        );
    });
});

/*
 * Владелец 09.11.2026: уведомление портала теряется в колокольчике —
 * сводку ставим задачей и шлём личным сообщением, как легаси deals-order.
 */
describe('DealAuditDigestService — каналы доставки', () => {
    const options = (channels: typeof DEFAULT_DIGEST_CHANNELS) => ({
        ...NO_RECIPIENTS,
        userIds: [1],
        channels,
    });

    /** Тексты личных сообщений по порядку отправки. */
    const messagesOf = (messageAdd: jest.Mock): string[] =>
        (messageAdd.mock.calls as [{ MESSAGE: string }][]).map(
            ([payload]) => payload.MESSAGE,
        );

    it('по умолчанию — личные сообщения: итог по сотрудникам и по сообщению на каждого', async () => {
        const { service, systemAdd, messageAdd, taskAdd } = makeService();

        const sent = await service.send(
            DOMAIN,
            VERDICTS,
            options(DEFAULT_DIGEST_CHANNELS),
            [],
        );

        expect(sent).toBe(1);
        expect(systemAdd).not.toHaveBeenCalled();
        expect(taskAdd).not.toHaveBeenCalled();
        const texts = messagesOf(messageAdd);
        // Итог + три сотрудника (69, 323, 500) — каждому своё сообщение.
        expect(texts).toHaveLength(4);
        expect(texts[0]).toContain('Забытые сделки: сводка по всем отделам');
        expect(texts[0]).toContain('Забытых сделок: 3, сотрудников: 3');
        expect(texts.slice(1).join('\n')).toContain(
            'Сотрудник: Фамилия69 Имя69',
        );
        expect(
            (messageAdd.mock.calls as [{ DIALOG_ID: string }][]).every(
                ([payload]) => payload.DIALOG_ID === '1',
            ),
        ).toBe(true);
    });

    it('сводка менеджеру своих сделок — одно сообщение', async () => {
        const { service, messageAdd } = makeService();

        await service.send(
            DOMAIN,
            [forgotten(1069, 69), forgotten(1070, 69)],
            {
                ...NO_RECIPIENTS,
                toManager: true,
                channels: DEFAULT_DIGEST_CHANNELS,
            },
            [],
        );

        const texts = messagesOf(messageAdd);
        expect(texts).toHaveLength(1);
        expect(texts[0]).toContain('Ваши забытые сделки');
        expect(texts[0]).toContain('#1070');
    });

    it('сообщение не ушло посреди серии — серия обрывается, в предупреждении сколько ушло', async () => {
        const { service, messageAdd } = makeService();
        messageAdd
            .mockResolvedValueOnce({ result: 1 })
            .mockRejectedValueOnce(new Error('QUERY_LIMIT_EXCEEDED'));
        const warnings: string[] = [];

        const sent = await service.send(
            DOMAIN,
            VERDICTS,
            options(DEFAULT_DIGEST_CHANNELS),
            warnings,
        );

        expect(sent).toBe(1);
        expect(messageAdd).toHaveBeenCalledTimes(2);
        expect(warnings.join(' ')).toContain(
            'сообщение сотруднику 1 не отправлено (ушло 1 из 4)',
        );
    });

    it('задача + сообщение: уведомления нет, задача со сводкой и числом, прошлая открытая закрыта', async () => {
        const {
            service,
            systemAdd,
            messageAdd,
            taskAdd,
            taskComplete,
            taskGetList,
        } = makeService('ok', [
            { id: 700, status: '2' },
            { id: 650, status: '5' },
        ]);
        const warnings: string[] = [];

        const sent = await service.send(
            DOMAIN,
            VERDICTS,
            options({ notify: false, message: true, task: true }),
            warnings,
        );

        expect(sent).toBe(1);
        expect(systemAdd).not.toHaveBeenCalled();
        expect(messageAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                DIALOG_ID: '1',
                MESSAGE: expect.stringContaining('Забытые сделки') as string,
            }),
        );
        expect(taskGetList).toHaveBeenCalledWith(
            expect.objectContaining({
                RESPONSIBLE_ID: 1,
                '%TITLE': DEAL_AUDIT_TASK_MARK,
            }),
            expect.any(Array),
        );
        // Открытая прошлая сводка закрыта, уже завершённая — не трогается.
        expect(taskComplete).toHaveBeenCalledTimes(1);
        expect(taskComplete).toHaveBeenCalledWith(700);
        expect(taskAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                TITLE: `Забытые сделки: сводка по всем отделам — 3 · ${DEAL_AUDIT_TASK_MARK}`,
                RESPONSIBLE_ID: 1,
                DESCRIPTION_IN_BBCODE: 'Y',
                DESCRIPTION: expect.stringContaining('#1069') as string,
                DEADLINE: expect.any(String) as string,
            }),
        );
        expect(warnings).toEqual([]);
    });

    it('сбой одного канала — предупреждение, второй канал доходит, получатель засчитан', async () => {
        const { service, taskAdd, messageAdd } = makeService();
        taskAdd.mockRejectedValueOnce(
            new Error('Request failed with status code 500'),
        );
        const warnings: string[] = [];

        const sent = await service.send(
            DOMAIN,
            VERDICTS,
            options({ notify: false, message: true, task: true }),
            warnings,
        );

        expect(sent).toBe(1);
        // Итог + три сотрудника: серия сообщений дошла целиком.
        expect(messageAdd).toHaveBeenCalledTimes(4);
        expect(warnings.join(' ')).toContain(
            'задача-сводка сотруднику 1 не создана',
        );
    });
});
