import { BitrixDateTime, ETimeZone } from '@/shared/lib/date';
import { EventReportTaskFlowService } from '../services/task/event-report-task-flow.service';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

/**
 * Перенос задачи (todo2508-02 №4):
 *  а) новое имя события ОБЯЗАНО оказаться в TITLE — включая легаси-заголовки
 *     с одиночными пробелами, которые старый `split('  ')` молча пропускал;
 *  б) ответственному уходит сообщение в чат (`im.notify`), ошибка отправки
 *     не роняет flow.
 */
type Call = { method: string; cmd: string; args: unknown[] };

const makeBitrix = (notifyError?: Error) => {
    const calls: Call[] = [];
    const notifyCalls: unknown[] = [];
    const record =
        (method: string) =>
        (cmd: string, ...args: unknown[]) =>
            calls.push({ method, cmd, args });

    return {
        calls,
        notifyCalls,
        bitrix: {
            batch: {
                task: {
                    add: record('task.add'),
                    update: record('task.update'),
                    complete: record('task.complete'),
                    commentAdd: record('task.commentAdd'),
                },
                checklistItem: { add: record('checklistItem.add') },
            },
            imNotify: {
                systemAdd: (payload: unknown) => {
                    notifyCalls.push(payload);
                    return notifyError
                        ? Promise.reject(notifyError)
                        : Promise.resolve(1);
                },
            },
        },
    };
};

const makePortal = () => ({
    getSalesTaskGroupId: () => 77,
    getEntityFieldByCode: () => undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
});

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

/**
 * Контекст переноса: isExpired + currentTask. `reportEventType` мок-поле —
 * в реальном контексте это геттер от `dto.currentTask.eventType`.
 */
const makeCtx = (over: Record<string, unknown> = {}) =>
    ({
        domain: 'portal.bitrix24.ru',
        isExpired: true,
        isNew: false,
        isNoResult: true,
        isFail: false,
        isSuccessSale: false,
        isPlanned: false,
        entityType: 'company',
        entityId: 500,
        planResponsibleId: 5,
        planCreatedById: 5,
        planDeadline: null,
        planEventType: null,
        reportEventType: 'warm',
        reportEventName: '',
        reportComment: '',
        planEventName: 'Новое имя',
        currentTask: { id: 900, title: 'Звонок  Старое имя' },
        currentBaseDeal: null,
        ownerDeal: null,
        company: null,
        lead: null,
        planContact: null,
        reportContact: null,
        taskChecklist: null,
        isPlanMarkedImportant: false,
        dto: { plan: { type: { current: null } } },
        ...over,
    }) as never;

const service = (bitrix: unknown) =>
    new EventReportTaskFlowService(
        bitrix as never,
        makePortal() as never,
        false,
    );

const updatedTitle = (calls: Call[]): string | undefined => {
    const update = calls.find(c => c.method === 'task.update');
    return (update?.args[1] as Record<string, string> | undefined)?.TITLE;
};

describe('EventReportTaskFlowService — TITLE при переносе (№4а)', () => {
    it('наш формат: меняется ТОЛЬКО средняя часть, хвост-контакт цел', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            makeCtx({
                currentTask: {
                    id: 900,
                    title: 'Звонок  Старое имя  Иван Петров',
                },
            }),
            deals,
        );

        expect(updatedTitle(calls)).toBe('Звонок  Новое имя  Иван Петров');
        expect(calls.find(c => c.method === 'task.update')?.cmd).toBe(
            'update_task_900',
        );
    });

    it('наш формат, имя не менялось — update не ставится вовсе', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            makeCtx({
                planEventName: 'Старое имя',
                currentTask: { id: 900, title: 'Звонок  Старое имя' },
            }),
            deals,
        );

        expect(calls.filter(c => c.method === 'task.update')).toEqual([]);
    });

    it('легаси-заголовок с одиночными пробелами пересобирается по типу отчёта', () => {
        // Сценарий владельца: задача «Звонок ОАО "ЗАВОД РТИ"» (легаси),
        // раньше split('  ') давал parts.length=1 → TITLE не менялся.
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            makeCtx({
                reportEventType: 'warm',
                currentTask: { id: 900, title: 'Звонок ОАО "ЗАВОД РТИ"' },
            }),
            deals,
        );

        expect(updatedTitle(calls)).toBe('Звонок  Новое имя');
    });

    it('легаси-заголовок холодной заявки — тип со словом вида', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            makeCtx({
                reportEventType: 'xoRequest',
                currentTask: { id: 900, title: 'Холодный звонок. Заявка. X' },
            }),
            deals,
        );

        expect(updatedTitle(calls)).toBe('Холодный обзвон. Заявка.  Новое имя');
    });

    it('легаси-заголовок «важного» типа получает эмодзи-префикс', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            makeCtx({
                reportEventType: 'hot',
                currentTask: { id: 900, title: 'Позвонить по решению' },
            }),
            deals,
        );

        expect(updatedTitle(calls)).toBe('🔥 Звонок по решению  Новое имя');
    });

    it('тип не определим — имя честно дописывается к заголовку', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            makeCtx({
                reportEventType: null,
                planEventType: null,
                currentTask: { id: 900, title: 'Доработка: ПЕРЕНОС звонка' },
            }),
            deals,
        );

        expect(updatedTitle(calls)).toBe(
            'Доработка: ПЕРЕНОС звонка  Новое имя',
        );
    });

    it('легаси-заголовок уже содержит новое имя — не трогаем', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            makeCtx({
                planEventName: 'ОАО "ЗАВОД РТИ"',
                currentTask: { id: 900, title: 'Звонок ОАО "ЗАВОД РТИ"' },
            }),
            deals,
        );

        expect(calls.filter(c => c.method === 'task.update')).toEqual([]);
    });

    it('имя не передали — TITLE не трогаем (только дедлайн)', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            makeCtx({
                planEventName: '',
                planDeadline: BitrixDateTime.fromPortalInput(
                    '2026-08-30T19:00:00',
                    ETimeZone.EUROPE_MOSCOW,
                ),
            }),
            deals,
        );

        const fields = calls.find(c => c.method === 'task.update')
            ?.args[1] as Record<string, string>;
        expect(fields.TITLE).toBeUndefined();
        expect(fields.DEADLINE).toBeDefined();
    });
});

describe('EventReportTaskFlowService — сообщение о переносе (№4б)', () => {
    const deadline = BitrixDateTime.fromPortalInput(
        '2026-08-30T19:00:00',
        ETimeZone.EUROPE_MOSCOW,
    );

    it('перенос — ответственному уходит im.notify с именем и новым сроком', async () => {
        const { bitrix, notifyCalls } = makeBitrix();

        await service(bitrix).notifyTransfer(
            makeCtx({ planDeadline: deadline }),
        );

        expect(notifyCalls).toHaveLength(1);
        const payload = notifyCalls[0] as { USER_ID: number; MESSAGE: string };
        expect(payload.USER_ID).toBe(5);
        expect(payload.MESSAGE).toContain('Звонок перенесён');
        expect(payload.MESSAGE).toContain('Новое имя');
        expect(payload.MESSAGE).toContain('новый срок 30 августа 19:00');
        expect(payload.MESSAGE).toContain(
            'https://portal.bitrix24.ru/company/personal/user/5/tasks/task/view/900/',
        );
    });

    it('шлём и когда ответственный = автор переноса (гейта нет)', async () => {
        // Владелец переносил сам себе и ждал сообщение — молчать нельзя.
        const { bitrix, notifyCalls } = makeBitrix();

        await service(bitrix).notifyTransfer(
            makeCtx({ planResponsibleId: 5, planCreatedById: 5 }),
        );

        expect(notifyCalls).toHaveLength(1);
    });

    it('без дедлайна часть «новый срок» опускается', async () => {
        const { bitrix, notifyCalls } = makeBitrix();

        await service(bitrix).notifyTransfer(makeCtx({ planDeadline: null }));

        const payload = notifyCalls[0] as { MESSAGE: string };
        expect(payload.MESSAGE).not.toContain('новый срок');
    });

    it('имя не меняли — берётся имя события из отчёта', async () => {
        const { bitrix, notifyCalls } = makeBitrix();

        await service(bitrix).notifyTransfer(
            makeCtx({ planEventName: '', reportEventName: 'Старое имя' }),
        );

        const payload = notifyCalls[0] as { MESSAGE: string };
        expect(payload.MESSAGE).toContain('Старое имя');
    });

    it('нет plan-ответственного — берётся ответственный задачи', async () => {
        const { bitrix, notifyCalls } = makeBitrix();

        await service(bitrix).notifyTransfer(
            makeCtx({
                planResponsibleId: 0,
                currentTask: { id: 900, title: 'Звонок  X', responsibleId: 8 },
            }),
        );

        expect((notifyCalls[0] as { USER_ID: number }).USER_ID).toBe(8);
    });

    it('не перенос — уведомления нет', async () => {
        const { bitrix, notifyCalls } = makeBitrix();

        await service(bitrix).notifyTransfer(makeCtx({ isExpired: false }));

        expect(notifyCalls).toEqual([]);
    });

    it('ошибка отправки гасится и flow не роняет', async () => {
        const { bitrix } = makeBitrix(new Error('im down'));

        await expect(
            service(bitrix).notifyTransfer(makeCtx()),
        ).resolves.toBeUndefined();
    });
});

describe('EventReportTaskFlowService — PRIORITY по флагу «важная» (№10)', () => {
    const plannedCtx = (over: Record<string, unknown> = {}) =>
        makeCtx({
            isExpired: false,
            isNoResult: false,
            isPlanned: true,
            currentTask: null,
            planEventType: 'warm',
            dto: { plan: { type: { current: { name: 'Звонок' } } } },
            ...over,
        });

    const addedPriority = (calls: Call[]): number | undefined =>
        (
            calls.find(c => c.method === 'task.add')?.args[0] as Record<
                string,
                number
            >
        )?.PRIORITY;

    it('флаг важности даёт HIGH даже «неважному» типу', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            plannedCtx({ isPlanMarkedImportant: true }),
            deals,
        );

        expect(addedPriority(calls)).toBe(2);
    });

    it('без флага «неважный» тип остаётся MEDIUM', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(plannedCtx(), deals);

        expect(addedPriority(calls)).toBe(1);
    });

    it('«важный» тип даёт HIGH и без флага (прежнее поведение цело)', () => {
        const { bitrix, calls } = makeBitrix();

        service(bitrix).queue(
            plannedCtx({
                planEventType: 'presentation',
                dto: { plan: { type: { current: { name: 'Презентация' } } } },
            }),
            deals,
        );

        expect(addedPriority(calls)).toBe(2);
    });
});
