import { DealAuditDigestService } from '../services/deal-audit-digest.service';
import { DEAL_AUDIT_STATUS } from '../constants/deal-audit.const';
import { DealAuditVerdict } from '../types/deal-audit.types';

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

const NO_RECIPIENTS = {
    toManager: false,
    toHead: false,
    userIds: [],
    departmentUserIds: [],
    excludeUserIds: [],
    limit: 20,
};

const makeService = (structure: 'ok' | 'down' = 'ok') => {
    const systemAdd = jest.fn().mockResolvedValue(true);
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: { imNotify: { systemAdd } },
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
    return { service, systemAdd, sentTo };
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
