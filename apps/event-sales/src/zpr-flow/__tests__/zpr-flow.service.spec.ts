import { ZprFlowService } from '../zpr-flow.service';
import { PBXService } from '@/modules/pbx';
import { PbxZprSmartService } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';

/**
 * Сайд-flow ЗПР: план создаёт элемент в «Запланирован» со связями и
 * план-комментарием в ленте; отчёт закрывает открытый элемент клиента
 * (или создаёт спонтанный), дописывая ленту; обратная ссылка op_zprs
 * дописывается на сделку/компанию. Self-gate без смарта.
 */
const INFO = {
    entityTypeId: 1038,
    typeId: 7,
    ufKeyByCode: {
        ZPR_BASE_DEAL: 'ufCrm7BaseDeal',
        ZPR_PRES_DEAL: 'ufCrm7PresDeal',
        ZPR_LEAD: 'ufCrm7Lead',
        ZPR_COMPANY: 'ufCrm7Company',
        ZPR_CONTACT: 'ufCrm7Contact',
        ZPR_PLAN_DATE: 'ufCrm7PlanDate',
        ZPR_DONE_DATE: 'ufCrm7DoneDate',
        ZPR_IS_SPONTANEOUS: 'ufCrm7Spont',
        ZPR_RESPONSIBLE: 'ufCrm7Resp',
        ZPR_PLAN_COMMENT: 'ufCrm7PlanComment',
        ZPR_REPORT_COMMENT: 'ufCrm7ReportComment',
        ZPR_COMMENTS: 'ufCrm7Comments',
        ZPR_LAST_CALL_DATE: 'ufCrm7LastCall',
        ZPR_NEXT_CALL_DATE: 'ufCrm7NextCall',
        ZPR_MOVE_COUNT: 'ufCrm7MoveCount',
    },
    enumItems: {},
    stageIdByCode: {
        zpr_plan: 'DT1038_9:PLAN',
        zpr_pending: 'DT1038_9:PENDING',
        zpr_success: 'DT1038_9:SUCCESS',
        zpr_noresult: 'DT1038_9:NORESULT',
        zpr_fail: 'DT1038_9:FAIL',
    },
};

const makeHarness = (over?: {
    info?: typeof INFO | null;
    openItems?: Array<Record<string, unknown>>;
    zprsField?: boolean;
    /** Открытые сделки основной воронки компании (для дотяжки baseDealId). */
    companyDeals?: Array<{ ID: string; ASSIGNED_BY_ID?: string }>;
}) => {
    const added: Array<Record<string, unknown>> = [];
    const updatedItems: Array<{ id: number; fields: Record<string, unknown> }> =
        [];
    const dealUpdates: Array<{ id: number; fields: Record<string, unknown> }> =
        [];
    const taskUpdates: Array<{ id: number; fields: Record<string, unknown> }> =
        [];

    const bitrix = {
        item: {
            add: (_typeId: string, fields: Record<string, unknown>) => {
                added.push(fields);
                return Promise.resolve({
                    result: { item: { id: 500 + added.length } },
                });
            },
            listAll: () => Promise.resolve(over?.openItems ?? []),
            update: (
                id: number,
                _typeId: never,
                fields: Record<string, unknown>,
            ) => {
                updatedItems.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
        deal: {
            get: () =>
                Promise.resolve({
                    result: { ID: '100', UF_CRM_OP_ZPRS: ['T40e_1'] },
                }),
            getList: () =>
                Promise.resolve({
                    result: over?.companyDeals ?? [],
                }),
            update: (id: number, fields: Record<string, unknown>) => {
                dealUpdates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
        company: {
            get: () => Promise.resolve({ result: { ID: '431' } }),
            update: (id: number, fields: Record<string, unknown>) => {
                dealUpdates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
        task: {
            get: () =>
                Promise.resolve({
                    result: { task: { ufCrmTask: ['D_100', 'CO_431'] } },
                }),
            update: (id: number, fields: Record<string, unknown>) => {
                taskUpdates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
    };

    const portal = {
        getTimezone: () => 'Europe/Moscow',
        getEntityFieldByCode: () =>
            (over?.zprsField ?? true) ? { bitrixId: 'OP_ZPRS' } : undefined,
        getFieldBitrixId: () => 'UF_CRM_OP_ZPRS',
        getDealCategoryByCode: () => ({ bitrixId: 5, stages: [] }),
    };

    const pbx = {
        init: () => Promise.resolve({ bitrix, PortalModel: portal }),
    } as unknown as PBXService;
    const zprSmart = {
        resolveInfo: () =>
            Promise.resolve(over?.info === undefined ? INFO : over.info),
    } as unknown as PbxZprSmartService;

    return {
        service: new ZprFlowService(pbx, zprSmart),
        added,
        updatedItems,
        dealUpdates,
        taskUpdates,
    };
};

const job = (over?: Partial<ZprFlowJobData>): ZprFlowJobData => ({
    domain: 'x.bitrix24.ru',
    operationId: 'op-1',
    kind: 'plan',
    baseDealId: 100,
    presDealId: 77,
    companyId: 431,
    leadId: 42,
    contactId: 9,
    responsibleId: 8,
    planDeadline: '01.09.2026 10:00:00',
    planName: 'Обсудить решение',
    planComment: 'Договорились созвониться',
    reportComment: null,
    isResult: true,
    ...over,
});

describe('ZprFlowService', () => {
    it('план: элемент в «Запланирован» со связями и лентой комментариев', async () => {
        const { service, added, dealUpdates } = makeHarness();
        await service.handle(job());

        expect(added).toHaveLength(1);
        const fields = added[0];
        expect(fields.stageId).toBe('DT1038_9:PLAN');
        expect(fields.ufCrm7BaseDeal).toEqual(['D_100']);
        expect(fields.ufCrm7PresDeal).toEqual(['D_77']);
        expect(fields.ufCrm7Company).toEqual(['CO_431']);
        expect(fields.ufCrm7Lead).toEqual(['L_42']);
        expect(fields.ufCrm7Contact).toEqual(['C_9']);
        expect(fields.ufCrm7PlanDate).toBe('01.09.2026 10:00:00');
        expect(String((fields.ufCrm7Comments as string[])[0])).toContain(
            'План: Договорились созвониться',
        );
        // Обратная ссылка op_zprs: сделка + компания, append без дублей.
        expect(dealUpdates).toHaveLength(2);
        expect(dealUpdates[0].fields.UF_CRM_OP_ZPRS).toEqual([
            'T40e_1',
            'T40e_501',
        ]);
    });

    it('отчёт: открытый элемент клиента закрывается с дописанной лентой', async () => {
        const { service, updatedItems, added } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1038_9:PLAN',
                    ufCrm7BaseDeal: ['D_100'],
                    ufCrm7Comments: ['01.08.2026 10:00:00 План: старое'],
                },
            ],
        });
        await service.handle(
            job({ kind: 'report', reportComment: 'Решение принято' }),
        );

        expect(added).toHaveLength(0);
        expect(updatedItems).toHaveLength(1);
        expect(updatedItems[0].id).toBe(601);
        expect(updatedItems[0].fields.stageId).toBe('DT1038_9:SUCCESS');
        const comments = updatedItems[0].fields.ufCrm7Comments as string[];
        expect(comments[0]).toContain('Отчёт: Решение принято');
        expect(comments[1]).toContain('План: старое');
    });

    it('отчёт без открытого элемента → спонтанный, сразу с исходом', async () => {
        const { service, added } = makeHarness({ openItems: [] });
        await service.handle(job({ kind: 'report', isResult: false }));

        expect(added).toHaveLength(1);
        expect(added[0].stageId).toBe('DT1038_9:NORESULT');
        expect(added[0].ufCrm7Spont).toBe('Y');
    });

    it('чужой открытый элемент (другая сделка) не закрывается', async () => {
        const { service, added, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 700,
                    stageId: 'DT1038_9:PLAN',
                    ufCrm7BaseDeal: ['D_999'],
                },
            ],
        });
        await service.handle(job({ kind: 'report' }));
        expect(updatedItems).toHaveLength(0);
        expect(added).toHaveLength(1); // спонтанный для НАШЕГО клиента
    });

    it('отчёт с taskId привязывает элемент к задаче (T{hex}_{id} в UF_CRM_TASK)', async () => {
        const { service, taskUpdates } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1038_9:PLAN',
                    ufCrm7BaseDeal: ['D_100'],
                },
            ],
        });
        await service.handle(job({ kind: 'report', taskId: 738563 }));

        expect(taskUpdates).toHaveLength(1);
        expect(taskUpdates[0].id).toBe(738563);
        // Существующие привязки сохранены, ссылка на элемент дописана.
        expect(taskUpdates[0].fields.UF_CRM_TASK).toEqual([
            'D_100',
            'CO_431',
            'T40e_601',
        ]);
    });

    it('без taskId (план/легаси-джоб) задача не трогается', async () => {
        const { service, taskUpdates } = makeHarness();
        await service.handle(job());
        expect(taskUpdates).toHaveLength(0);
    });

    it('смарт не установлен — тишина (self-gate)', async () => {
        const { service, added, updatedItems } = makeHarness({ info: null });
        const result = await service.handle(job());
        expect(result.action).toBe('skipped');
        expect(added).toHaveLength(0);
        expect(updatedItems).toHaveLength(0);
    });

    it('дотяжка: сделку создал этот же отчёт — id находится по компании', async () => {
        const { service, added } = makeHarness({
            // ASSIGNED_BY_ID строкой — REST отдаёт строки, сравнение числом.
            companyDeals: [
                { ID: '321', ASSIGNED_BY_ID: '8' },
                { ID: '555', ASSIGNED_BY_ID: '8' },
            ],
        });
        const result = await service.handle(job({ baseDealId: null }));

        expect(result.action).toBe('created');
        // Свежая (максимальный id) открытая сделка основной воронки.
        expect(added[0].ufCrm7BaseDeal).toEqual(['D_555']);
    });

    it('дотяжка: своя сделка предпочитается чужой даже с меньшим id', async () => {
        const { service, added } = makeHarness({
            companyDeals: [
                { ID: '321', ASSIGNED_BY_ID: '8' },
                // Чужая свежее — но правило владельца (25.08) её исключает.
                { ID: '555', ASSIGNED_BY_ID: '3' },
            ],
        });
        await service.handle(job({ baseDealId: null }));

        expect(added[0].ufCrm7BaseDeal).toEqual(['D_321']);
    });

    it('дотяжка: только чужие открытые — сделка не подхватывается вовсе', async () => {
        const { service, added } = makeHarness({
            companyDeals: [
                { ID: '321', ASSIGNED_BY_ID: '3' },
                { ID: '555', ASSIGNED_BY_ID: '5' },
            ],
        });
        await service.handle(job({ baseDealId: null }));

        // Честная деградация: элемент живёт на компании/лиде, чужая сделка
        // не трогается (правило владельца 25.08).
        expect(added[0].ufCrm7BaseDeal).toBeUndefined();
        expect(added[0].ufCrm7Company).toEqual(['CO_431']);
    });

    it('перенос двигает элемент в «Ожидание» со счётчиком, не закрывая', async () => {
        const { service, added, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1038_9:PLAN',
                    ufCrm7BaseDeal: ['D_100'],
                    ufCrm7MoveCount: 2,
                },
            ],
        });
        const result = await service.handle(
            job({
                kind: 'report',
                isMove: true,
                planDeadline: '05.09.2026 10:00:00',
            }),
        );

        expect(result.action).toBe('moved');
        expect(added).toHaveLength(0);
        expect(updatedItems[0].fields.stageId).toBe('DT1038_9:PENDING');
        expect(updatedItems[0].fields.ufCrm7MoveCount).toBe(3);
        expect(updatedItems[0].fields.ufCrm7PlanDate).toBe(
            '05.09.2026 10:00:00',
        );
        expect(
            String((updatedItems[0].fields.ufCrm7Comments as string[])[0]),
        ).toContain('Перенос:');
    });

    it('перенос без открытого элемента честно создаёт план', async () => {
        const { service, added } = makeHarness({ openItems: [] });
        const result = await service.handle(
            job({ kind: 'report', isMove: true }),
        );

        expect(result.action).toBe('created');
        expect(added[0].stageId).toBe('DT1038_9:PLAN');
    });

    it('голый id в одиночно-типизированном поле связи тоже матчится', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 700,
                    stageId: 'DT1038_9:PLAN',
                    // Битрикс нормализовал одиночную привязку до числа.
                    ufCrm7BaseDeal: ['100'],
                },
            ],
        });
        await service.handle(job({ kind: 'report' }));
        expect(updatedItems[0].id).toBe(700);
    });

    it('дотяжка не нашла сделку — элемент честно живёт на компании/лиде', async () => {
        const { service, added } = makeHarness({ companyDeals: [] });
        await service.handle(job({ baseDealId: null }));

        expect(added[0].ufCrm7BaseDeal).toBeUndefined();
        expect(added[0].ufCrm7Company).toEqual(['CO_431']);
    });
});
