import { BitrixDateTime, ETimeZone } from '@/shared/lib/date';
import { EventReportTaskFlowService } from '../services/task/event-report-task-flow.service';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import { EVENT_TASK_CHECKLIST_ITEM } from '../services/task/event-task-checklist.catalog';

/**
 * Чек-лист задачи обзвона (todo2508 §13):
 *  - пункты ставятся ТОЛЬКО при включённой настройке портала;
 *  - при закрытии задачи её пункты читаются отдельным вызовом ДО батча;
 *  - итог уезжает в контекст (история карточки) и комментарием в задачу.
 */
type Call = { method: string; cmd: string; args: unknown[] };

const makeBitrix = (checklistItems: unknown[] | Error = []) => {
    const calls: Call[] = [];
    const getListCalls: unknown[] = [];
    const record =
        (method: string) =>
        (cmd: string, ...args: unknown[]) =>
            calls.push({ method, cmd, args });

    return {
        calls,
        getListCalls,
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
            checklistItem: {
                getList: (payload: unknown) => {
                    getListCalls.push(payload);
                    if (checklistItems instanceof Error) {
                        return Promise.reject(checklistItems);
                    }
                    return Promise.resolve({ result: checklistItems });
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

/** Мок контекста с рабочим сеттером чек-листа (его пишет сам сервис). */
const makeCtx = (over: Record<string, unknown> = {}) => {
    const ctx: Record<string, unknown> = {
        domain: 'portal.bitrix24.ru',
        isExpired: false,
        isNew: false,
        isNoResult: false,
        isFail: false,
        isSuccessSale: false,
        isPlanned: true,
        entityType: 'deal',
        entityId: 500,
        planResponsibleId: 5,
        planCreatedById: 5,
        planDeadline: BitrixDateTime.fromPortalInput(
            '2026-08-15T10:00:00',
            ETimeZone.EUROPE_MOSCOW,
        ),
        reportComment: '',
        planEventType: 'presentation',
        currentTask: null,
        currentBaseDeal: null,
        ownerDeal: null,
        company: null,
        lead: null,
        planContact: null,
        reportContact: null,
        taskChecklist: null,
        dto: { plan: { type: { current: { name: 'Презентация' } } } },
        ...over,
    };
    ctx.setTaskChecklist = (outcome: unknown): void => {
        ctx.taskChecklist = outcome;
    };
    return ctx as never;
};

const checklistItem = (title: string, done: boolean) => ({
    ID: '1',
    TITLE: title,
    IS_COMPLETE: done ? 'Y' : 'N',
    SORT_INDEX: '0',
    PARENT_ID: '10',
});

describe('EventReportTaskFlowService — чек-лист новой задачи', () => {
    it('настройка выключена — пунктов не ставим, задача как раньше', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            false,
        );

        service.queue(makeCtx(), deals);

        expect(calls.filter(c => c.method === 'task.add')).toHaveLength(1);
        expect(calls.filter(c => c.method === 'checklistItem.add')).toEqual([]);
    });

    it('настройка включена — пункты ставятся ссылкой на результат add_task', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            true,
        );

        service.queue(makeCtx(), deals);

        const items = calls.filter(c => c.method === 'checklistItem.add');
        expect(items).toHaveLength(3);

        const payloads = items.map(
            call =>
                call.args[0] as { TASKID: string; FIELDS: { TITLE: string } },
        );
        for (const payload of payloads) {
            expect(payload.TASKID).toBe('$result[add_task][task][id]');
        }
        expect(payloads.map(p => p.FIELDS.TITLE)).toEqual([
            'Презентация проведена',
            'Дата следующей коммуникации назначена',
            'Возражения зафиксированы',
        ]);
        // Команда создания задачи обязана называться add_task — на неё
        // ссылаются пункты.
        expect(calls.find(c => c.method === 'task.add')?.cmd).toBe('add_task');
    });

    it('без плана задача не создаётся — пунктов тоже нет', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            true,
        );

        service.queue(makeCtx({ isPlanned: false }), deals);

        expect(calls.filter(c => c.method === 'task.add')).toEqual([]);
        expect(calls.filter(c => c.method === 'checklistItem.add')).toEqual([]);
    });
});

describe('EventReportTaskFlowService — чтение чек-листа при закрытии', () => {
    const closingCtx = (over: Record<string, unknown> = {}) =>
        makeCtx({ currentTask: { id: 900 }, ...over });

    it('пункты закрываемой задачи читаются отдельным вызовом', async () => {
        const { bitrix, getListCalls } = makeBitrix([
            checklistItem('Презентация проведена', true),
            checklistItem('Возражения зафиксированы', false),
        ]);
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            true,
        );
        const ctx = closingCtx();

        await service.readClosingChecklist(ctx);

        expect(getListCalls).toEqual([
            { TASKID: 900, ORDER: { SORT_INDEX: 'asc' } },
        ]);
        const outcome = (
            ctx as unknown as { taskChecklist: { items: unknown[] } }
        ).taskChecklist;
        expect(outcome.items).toEqual([
            {
                code: EVENT_TASK_CHECKLIST_ITEM.presentationDone,
                title: 'Презентация проведена',
                done: true,
            },
            {
                code: EVENT_TASK_CHECKLIST_ITEM.objectionRecorded,
                title: 'Возражения зафиксированы',
                done: false,
            },
        ]);
    });

    it('итог уходит комментарием в задачу перед её закрытием', async () => {
        const { bitrix, calls } = makeBitrix([
            checklistItem('Презентация проведена', true),
        ]);
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            true,
        );
        const ctx = closingCtx();

        await service.readClosingChecklist(ctx);
        service.queue(ctx, deals);

        const comment = calls.find(c => c.method === 'task.commentAdd');
        expect(comment?.args[0]).toBe(900);
        expect(
            (comment?.args[1] as { POST_MESSAGE: string }).POST_MESSAGE,
        ).toContain('выполнено — «Презентация проведена»');
        // Комментарий обязан быть поставлен ДО команды закрытия.
        expect(
            calls.findIndex(c => c.method === 'task.commentAdd'),
        ).toBeLessThan(calls.findIndex(c => c.method === 'task.complete'));
    });

    it('настройка выключена — чек-лист не читается вовсе', async () => {
        const { bitrix, getListCalls } = makeBitrix([
            checklistItem('Презентация проведена', true),
        ]);
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            false,
        );

        await service.readClosingChecklist(closingCtx());

        expect(getListCalls).toEqual([]);
    });

    it('перенос события задачу не закрывает — читать нечего', async () => {
        const { bitrix, getListCalls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            true,
        );

        await service.readClosingChecklist(closingCtx({ isExpired: true }));

        expect(getListCalls).toEqual([]);
    });

    it('недозвон без финального статуса задачу не закрывает', async () => {
        const { bitrix, getListCalls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            true,
        );

        await service.readClosingChecklist(closingCtx({ isNoResult: true }));

        expect(getListCalls).toEqual([]);
    });

    it('упавшее чтение не роняет отчёт — итог остаётся пустым', async () => {
        const { bitrix } = makeBitrix(new Error('rest down'));
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            true,
        );
        const ctx = closingCtx();

        await expect(
            service.readClosingChecklist(ctx),
        ).resolves.toBeUndefined();
        expect(
            (ctx as unknown as { taskChecklist: unknown }).taskChecklist,
        ).toBeNull();
    });
});

describe('EventReportTaskFlowService — DESCRIPTION новой задачи', () => {
    it('описание уезжает BB-кодом с batch-безопасными переносами', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            false,
        );

        service.queue(
            makeCtx({
                company: {
                    ID: 12,
                    TITLE: 'ООО «Ромашка»',
                    PHONE: [{ VALUE: '+7 900 000-00-01', VALUE_TYPE: 'WORK' }],
                },
                currentBaseDeal: { ID: 34, TITLE: 'Продажа СПС' },
            }),
            deals,
        );

        const fields = calls.find(c => c.method === 'task.add')
            ?.args[0] as Record<string, string>;
        expect(fields.DESCRIPTION_IN_BBCODE).toBe('Y');
        expect(fields.DESCRIPTION).toContain(
            '[URL=https://portal.bitrix24.ru/crm/company/details/12/]',
        );
        expect(fields.DESCRIPTION).toContain(
            '[URL=https://portal.bitrix24.ru/crm/deal/details/34/]',
        );
        // `+` уезжает как %2B (toBatchSafeText): в query-строке batch плюс
        // декодируется ПРОБЕЛОМ, и телефон доехал бы как « 7 900…».
        expect(fields.DESCRIPTION).toContain('%2B7 900 000-00-01');
        // Сырых переносов в batch-значении быть не должно.
        expect(fields.DESCRIPTION).not.toContain('\n');
        expect(fields.DESCRIPTION).toContain('%0A');
    });

    it('данных нет — DESCRIPTION не отправляется вовсе', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
            false,
        );

        service.queue(makeCtx(), deals);

        const fields = calls.find(c => c.method === 'task.add')
            ?.args[0] as Record<string, string>;
        expect(fields.DESCRIPTION).toBeUndefined();
        expect(fields.DESCRIPTION_IN_BBCODE).toBeUndefined();
    });
});
