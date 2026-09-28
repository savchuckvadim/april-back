import { EventReportActingManagerService } from '../services/acting-manager/event-report-acting-manager.service';
import { EventReportContext } from '../services/context/event-report.context';
import { ActingManagerMark } from '../services/acting-manager/acting-manager.mark';

/**
 * РЕЖИМ РУКОВОДИТЕЛЯ: проверка пометки по структуре отдела и уведомление.
 *
 * Проверка — согласованность, а не защита (id приходят с клиента): сбой
 * структуры или чужой сотрудник пометку не снимают, а лишь убирают из неё
 * слово «руководитель». Отчёт не падает ни в одном из случаев.
 */
const DOMAIN = 'example.bitrix24.ru';

const structureResponse = (subordinateIds: number[]) => ({
    currentUser: { subordinateIds },
    department: {
        allUsers: [{ ID: 481, NAME: 'Иван', LAST_NAME: 'Иванов' }],
    },
    salesDepartments: [],
});

const makeService = (
    getStructure: jest.Mock = jest
        .fn()
        .mockResolvedValue(structureResponse([231, 465])),
) => ({
    getStructure,
    service: new EventReportActingManagerService({ getStructure } as never),
});

const dto = (over: Record<string, unknown> = {}) =>
    ({
        domain: DOMAIN,
        plan: { responsibility: { ID: 231 } },
        actingManager: { ID: 481, NAME: 'Имя с клиента' },
        ...over,
    }) as never;

describe('EventReportActingManagerService.resolve', () => {
    it('обычный отчёт (поля нет) — пометки нет, структура не читается', async () => {
        const { service, getStructure } = makeService();
        await expect(
            service.resolve(dto({ actingManager: undefined })),
        ).resolves.toBeNull();
        expect(getStructure).not.toHaveBeenCalled();
    });

    it('отчёт за самого себя режимом руководителя не считается', async () => {
        const { service, getStructure } = makeService();
        await expect(
            service.resolve(dto({ plan: { responsibility: { ID: 481 } } })),
        ).resolves.toBeNull();
        expect(getStructure).not.toHaveBeenCalled();
    });

    it('нет ответственного плана — пометки нет', async () => {
        const { service } = makeService();
        await expect(service.resolve(dto({ plan: {} }))).resolves.toBeNull();
    });

    it('мусорный id руководителя — пометки нет', async () => {
        const { service } = makeService();
        await expect(
            service.resolve(dto({ actingManager: { ID: 'abc' } })),
        ).resolves.toBeNull();
    });

    it('сотрудник в подчинении — роль подтверждена, имя из структуры', async () => {
        const { service, getStructure } = makeService();
        await expect(service.resolve(dto())).resolves.toEqual({
            id: 481,
            name: 'Иванов Иван',
            isConfirmedHead: true,
        });
        expect(getStructure).toHaveBeenCalledWith(DOMAIN, 'sales', 481);
    });

    it('сотрудник НЕ в подчинении — пометка остаётся, роль не подтверждена', async () => {
        const { service } = makeService(
            jest.fn().mockResolvedValue(structureResponse([465])),
        );
        const mark = await service.resolve(dto());
        expect(mark).toMatchObject({ id: 481, isConfirmedHead: false });
    });

    it('руководителя нет в структуре — имя берётся из запроса', async () => {
        const { service } = makeService(
            jest.fn().mockResolvedValue({
                ...structureResponse([231]),
                department: { allUsers: [] },
            }),
        );
        await expect(service.resolve(dto())).resolves.toEqual({
            id: 481,
            name: 'Имя с клиента',
            isConfirmedHead: true,
        });
    });

    it('структура не прочиталась — отчёт не падает, роль не подтверждена', async () => {
        const { service } = makeService(
            jest.fn().mockRejectedValue(new Error('bitrix down')),
        );
        await expect(service.resolve(dto())).resolves.toEqual({
            id: 481,
            name: 'Имя с клиента',
            isConfirmedHead: false,
        });
    });
});

describe('EventReportActingManagerService.notify', () => {
    const HEAD: ActingManagerMark = {
        id: 481,
        name: 'Иванов Иван',
        isConfirmedHead: true,
    };

    const makeCtx = (
        mark: ActingManagerMark | null,
        over: { planResponsibleId?: number; taskResponsibleId?: number } = {},
    ) => {
        const ctx = new EventReportContext(
            {
                domain: DOMAIN,
                currentTask: { id: 900, eventType: 'warm', name: 'Бюджет' },
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'inJob' } },
                },
                plan: {
                    responsibility: { ID: over.planResponsibleId ?? 231 },
                },
            } as never,
            {
                getTimezone: () => 'Europe/Moscow',
                getPortal: () => ({ domain: DOMAIN }),
            } as never,
            {
                entityType: 'company',
                entityId: 431,
                company: { ID: '431', TITLE: 'ООО Ромашка' },
                lead: null,
                currentBaseDeal: null,
                ownerDeal: null,
                currentTask: {
                    id: 900,
                    responsibleId: String(over.taskResponsibleId ?? 231),
                },
            } as never,
            new Date('2026-09-28T09:00:00.000Z'),
        );
        ctx.setActingManager(mark);
        return ctx;
    };

    /** Что уходит в im.notify.system.add. */
    interface NotifyPayload {
        USER_ID: number;
        MESSAGE: string;
        TAG: string;
    }
    type NotifyMock = jest.Mock<Promise<void>, [NotifyPayload]>;

    const makeBitrix = (
        systemAdd: NotifyMock = jest.fn<Promise<void>, [NotifyPayload]>(() =>
            Promise.resolve(),
        ),
    ) => ({
        systemAdd,
        bitrix: { imNotify: { systemAdd } } as never,
    });

    const recipientsOf = (systemAdd: NotifyMock): number[] =>
        systemAdd.mock.calls.map(([payload]) => payload.USER_ID);

    it('обычный отчёт — уведомлений нет', async () => {
        const { service } = makeService();
        const { bitrix, systemAdd } = makeBitrix();
        await service.notify(makeCtx(null), bitrix);
        expect(systemAdd).not.toHaveBeenCalled();
    });

    it('сотрудник получает одно уведомление с именем руководителя', async () => {
        const { service } = makeService();
        const { bitrix, systemAdd } = makeBitrix();
        await service.notify(makeCtx(HEAD), bitrix);

        expect(systemAdd).toHaveBeenCalledTimes(1);
        const [payload] = systemAdd.mock.calls[0];
        expect(payload.USER_ID).toBe(231);
        expect(payload.MESSAGE).toContain('Иванов Иван');
        expect(payload.MESSAGE).toContain('ООО Ромашка');
        expect(payload.TAG).toContain('company-431-900');
    });

    it('дело передано другому подчинённому — узнают оба', async () => {
        const { service } = makeService();
        const { bitrix, systemAdd } = makeBitrix();
        await service.notify(
            makeCtx(HEAD, { planResponsibleId: 465, taskResponsibleId: 231 }),
            bitrix,
        );
        const recipients = recipientsOf(systemAdd);
        expect(recipients.sort()).toEqual([231, 465]);
    });

    it('самому руководителю уведомление не уходит', async () => {
        const { service } = makeService();
        const { bitrix, systemAdd } = makeBitrix();
        await service.notify(
            makeCtx(HEAD, { planResponsibleId: 231, taskResponsibleId: 481 }),
            bitrix,
        );
        const recipients = recipientsOf(systemAdd);
        expect(recipients).toEqual([231]);
    });

    it('сбой отправки не роняет отчёт', async () => {
        const { service } = makeService();
        const { bitrix } = makeBitrix(
            jest.fn<Promise<void>, [NotifyPayload]>(() =>
                Promise.reject(new Error('im down')),
            ),
        );
        await expect(
            service.notify(makeCtx(HEAD), bitrix),
        ).resolves.toBeUndefined();
    });
});
