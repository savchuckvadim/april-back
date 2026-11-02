import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { EventReportTmcUseCase } from '../use-cases/event-report-tmc.use-case';
import { PresentationFlowJobData } from '../../presentation-flow/dto/presentation-flow-job.dto';

/**
 * Поток ТМЦ целиком на моках Битрикса: лишние сделки закрываются ДО батча,
 * ТМЦ-сделка создаётся и отдаётся задаче, РПА и таймлайну подстановкой,
 * сделки отдела продаж не трогаются, после батча заявка на презентацию
 * уезжает в очередь смарта с реальными id из ответа батча.
 */
const SALES_BASE_CATEGORY = {
    code: 'sales_base',
    bitrixId: '97',
    stages: [
        { code: 'sales_base_warm', bitrixId: 'WARM' },
        { code: 'sales_base_success', bitrixId: 'WON' },
        { code: 'sales_base_double', bitrixId: 'APOLOGY' },
    ],
};
const TMC_CATEGORY = {
    code: 'tmc_base',
    bitrixId: '103',
    stages: [
        { code: 'sales_tmc_plan', bitrixId: 'PLAN' },
        { code: 'sales_tmc_pending', bitrixId: 'PENDING' },
        { code: 'sales_tmc_pres_in_progress', bitrixId: 'IN_PROGRESS' },
        { code: 'sales_tmc_success', bitrixId: 'WON' },
        { code: 'sales_tmc_fail', bitrixId: 'LOSE' },
        { code: 'sales_tmc_noresult', bitrixId: 'APOLOGY' },
    ],
};

type Calls = Record<string, unknown[][]>;

const makeBitrix = (batchResults: IBitrixBatchResponseResult[]) => {
    const calls: Calls = {};
    const rec = (name: string) =>
        jest.fn((...args: unknown[]) => {
            (calls[name] ??= []).push(args);
        });
    const bitrix = {
        api: {
            callBatchWithConcurrency: jest.fn(() =>
                Promise.resolve(batchResults),
            ),
        },
        batch: {
            company: { update: rec('company.update') },
            contact: { update: rec('contact.update') },
            lead: { update: rec('lead.update') },
            deal: { set: rec('deal.set'), update: rec('deal.update') },
            task: {
                add: rec('task.add'),
                update: rec('task.update'),
                complete: rec('task.complete'),
                commentAdd: rec('task.commentAdd'),
            },
            timeline: { addTimelineComment: rec('timeline.add') },
            listItem: {
                add: rec('listItem.add'),
                update: rec('listItem.update'),
            },
            rpaItem: { add: rec('rpaItem.add') },
        },
        deal: {
            getList: jest.fn<
                Promise<{ result: Array<{ ID: string }> }>,
                [Record<string, unknown>]
            >(() => Promise.resolve({ result: [{ ID: '888' }] })),
            update: jest.fn<
                Promise<{ result: boolean }>,
                [number, Record<string, unknown>]
            >(() => Promise.resolve({ result: true })),
        },
        listItem: { get: jest.fn() },
        imNotify: { systemAdd: jest.fn(() => Promise.resolve()) },
    };
    return { bitrix, calls };
};

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'gsr.bitrix24.ru' }),
    getEntityFieldByCode: () => undefined,
    getFieldBitrixId: () => null,
    getFieldItemByCode: () => undefined,
    getDealCategoryByCode: (code: string) =>
        code === 'tmc_base' ? TMC_CATEGORY : undefined,
    getDealCategories: () => [SALES_BASE_CATEGORY, TMC_CATEGORY],
    getRpaByCode: (code: string) =>
        code === 'presentation' ? { bitrixId: 7, code } : undefined,
    getRpaFieldBitrixIdByCode: (_rpa: string, code: string) =>
        `UF_RPA_7_${code.toUpperCase()}`,
    getSalesTaskGroupId: () => 12,
    getListByCode: () => undefined,
});

const makeInit = (over: Record<string, unknown> = {}) => ({
    entityId: 431,
    entityType: 'company',
    company: { ID: '431', TITLE: 'ООО «Ромашка»' },
    lead: null,
    ownerDeal: null,
    // Основная сделка ОП у компании есть — поток ТМЦ её не трогает.
    currentBaseDeal: { ID: '100', STAGE_ID: 'C97:WARM' },
    currentXoDeal: null,
    currentPresDeal: null,
    currentTmcDeal: null,
    currentTmcFromPresentation: null,
    companyTmcDeal: null,
    currentTask: null,
    reportContact: null,
    planContact: null,
    ...over,
});

const dto = (over: Record<string, unknown> = {}) => ({
    domain: 'gsr.bitrix24.ru',
    operationId: 'op-1',
    departament: { mode: { id: 2, code: 'tmc', name: 'ТМЦ' } },
    context: { from: 'company', companyId: 431 },
    plan: {
        isPlanned: true,
        isActive: true,
        type: { current: { id: 2, code: 'presentation', name: 'Презентация' } },
        name: 'Демо СПС',
        deadline: '2026-11-15T14:30:00',
        responsibility: { ID: 251 },
        createdBy: { ID: 7 },
        contact: null,
    },
    report: {
        resultStatus: 'result',
        description: 'Директор ждёт показ',
        workStatus: { current: { code: 'inJob' } },
        isNoCall: false,
        contact: null,
    },
    presentation: {
        count: { company: 0, smart: 0, deal: 0 },
        isPresentationDone: false,
        isUnplannedPresentation: false,
    },
    ...over,
});

const makeUseCase = (
    options: {
        init?: Record<string, unknown>;
        batchResults?: IBitrixBatchResponseResult[];
        dispatchError?: Error;
    } = {},
) => {
    const batchResults = options.batchResults ?? [
        {
            // Формы ответов Битрикса: crm.deal.add — голый id,
            // tasks.task.add — объект { task: { id } }.
            result: { set_tmc_deal: 777, add_task: { task: { id: '555' } } },
            result_error: [],
        } as unknown as IBitrixBatchResponseResult,
    ];
    const { bitrix, calls } = makeBitrix(batchResults);
    const portal = makePortal();
    const dispatch = jest.fn(() =>
        options.dispatchError
            ? Promise.reject(options.dispatchError)
            : Promise.resolve(),
    );
    const notify = jest.fn(() => Promise.resolve());
    const useCase = new EventReportTmcUseCase(
        {
            init: () => Promise.resolve({ bitrix, PortalModel: portal }),
        } as unknown as ConstructorParameters<typeof EventReportTmcUseCase>[0],
        {
            loadContext: () => Promise.resolve(makeInit(options.init)),
        } as unknown as ConstructorParameters<typeof EventReportTmcUseCase>[1],
        {
            fieldPolicy: () =>
                Promise.resolve({
                    calculatedNextEvent: false,
                    resetOnFinal: false,
                }),
            taskChecklistEnabled: () => Promise.resolve(false),
        } as unknown as ConstructorParameters<typeof EventReportTmcUseCase>[2],
        {
            resolve: () => Promise.resolve(null),
            notify,
        } as unknown as ConstructorParameters<typeof EventReportTmcUseCase>[3],
        { dispatch } as unknown as ConstructorParameters<
            typeof EventReportTmcUseCase
        >[4],
    );
    return { useCase, bitrix, calls, dispatch, notify };
};

describe('EventReportTmcUseCase', () => {
    it('заявка на презентацию: закрывает лишние сделки до батча, создаёт ТМЦ-сделку, задачу, РПА, таймлайн и ставит заявку в очередь смарта', async () => {
        const { useCase, bitrix, calls, dispatch, notify } = makeUseCase();

        const result = await useCase.execute(dto() as never, 'sock-1');

        expect(result).toEqual({
            success: true,
            commandsCount: 2,
            entityType: 'company',
            entityId: 431,
        });

        // 1. Лишние открытые сделки компании у менеджера — прямыми вызовами
        //    до батча; своя воронка ТМЦ не чистится (текущей сделки нет).
        expect(bitrix.deal.getList).toHaveBeenCalledTimes(1);
        expect(bitrix.deal.update).toHaveBeenCalledWith(888, {
            STAGE_ID: 'C97:APOLOGY',
        });

        // 2. ТМЦ-сделка создаётся на компанию в «презентация в работе».
        expect(calls['deal.set']).toHaveLength(1);
        const [setCmd, dealFields] = calls['deal.set'][0] as [
            string,
            Record<string, unknown>,
        ];
        expect(setCmd).toBe('set_tmc_deal');
        expect(dealFields).toMatchObject({
            CATEGORY_ID: '103',
            STAGE_ID: 'C103:IN_PROGRESS',
            COMPANY_ID: '431',
            ASSIGNED_BY_ID: '251',
            TITLE: 'ТМЦ: ООО «Ромашка»',
        });
        // Основная сделка ОП (#100) не трогается.
        expect(calls['deal.update']).toBeUndefined();

        // 3. Задача ТМЦ-менеджеру со ссылкой на создаваемую ТМЦ-сделку и компанию.
        expect(calls['task.add']).toHaveLength(1);
        const [taskCmd, task] = calls['task.add'][0] as [
            string,
            Record<string, unknown>,
        ];
        expect(taskCmd).toBe('add_task');
        expect(task.RESPONSIBLE_ID).toBe(251);
        expect(task.CREATED_BY).toBe(7);
        expect(task.UF_CRM_TASK).toEqual(['D_$result[set_tmc_deal]', 'CO_431']);

        // 4. Заявка в РПА — с той же подстановкой ТМЦ-сделки.
        expect(calls['rpaItem.add']).toHaveLength(1);
        const [, rpa] = calls['rpaItem.add'][0] as [
            string,
            { typeId: number; fields: Record<string, unknown> },
        ];
        expect(rpa.typeId).toBe(7);
        expect(rpa.fields.UF_RPA_7_RPA_CRM_TMC_DEAL).toBe(
            '$result[set_tmc_deal]',
        );
        expect(rpa.fields.createdBy).toBe(7);

        // 5. Компания переходит к ТМЦ-менеджеру (легаси), таймлайн — в компанию и ТМЦ-сделку.
        expect(calls['company.update'][0]).toEqual([
            'update_entity_company_431',
            431,
            { ASSIGNED_BY_ID: 251 },
        ]);
        expect(calls['timeline.add']).toHaveLength(2);
        expect(
            calls['timeline.add'].map(
                call => (call[1] as { ENTITY_ID: unknown }).ENTITY_ID,
            ),
        ).toEqual([431, '$result[set_tmc_deal]']);

        // 6. Один HTTP-батч, затем заявка в очередь смарта с id из ответа батча.
        expect(bitrix.api.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledTimes(1);
        const [queue, jobName, job, jobId, opts] = dispatch.mock
            .calls[0] as unknown as [
            QueueNames,
            JobNames,
            PresentationFlowJobData,
            string,
            Record<string, unknown>,
        ];
        expect(queue).toBe(QueueNames.EVENT_SALES_PRESENTATION_FLOW);
        expect(jobName).toBe(JobNames.EVENT_SALES_PRESENTATION_FLOW);
        expect(jobId).toBe('op-1:pres:request');
        expect(opts).toEqual({ removeOnComplete: true, removeOnFail: true });
        expect(job).toMatchObject({
            kind: 'request',
            tmcDealId: 777,
            planTaskId: 555,
            companyId: 431,
            responsibleId: 251,
            planResponsibleId: 7,
            tmcResponsibleId: 251,
            ownerId: 7,
            requestComment: 'Директор ждёт показ',
            socketId: 'sock-1',
            baseDealId: null,
        });
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('обычный звонок ТМЦ по открытой ТМЦ-сделке: обновляет её, своя воронка чистится без текущей, заявки нет', async () => {
        const { useCase, bitrix, calls, dispatch } = makeUseCase({
            init: {
                companyTmcDeal: {
                    ID: '500',
                    STAGE_ID: 'C103:PLAN',
                    ASSIGNED_BY_ID: '251',
                },
            },
        });

        await useCase.execute(
            dto({
                plan: {
                    isPlanned: true,
                    isActive: true,
                    type: { current: { id: 1, code: 'warm', name: 'Звонок' } },
                    name: 'Перезвонить',
                    deadline: '2026-11-05T12:00:00',
                    responsibility: { ID: 251 },
                    createdBy: { ID: 251 },
                    contact: null,
                },
            }) as never,
        );

        // Обе воронки с APOLOGY опрошены, в ТМЦ — без текущей сделки #500.
        expect(bitrix.deal.getList).toHaveBeenCalledTimes(2);
        expect(bitrix.deal.getList.mock.calls[1][0]).toMatchObject({
            '!=ID': 500,
        });

        expect(calls['deal.set']).toBeUndefined();
        expect(calls['deal.update']).toHaveLength(1);
        expect(calls['deal.update'][0][0]).toBe('update_tmc_deal_500');
        expect(calls['deal.update'][0][2]).toMatchObject({
            STAGE_ID: 'C103:PLAN',
            ASSIGNED_BY_ID: '251',
        });
        expect(
            (calls['task.add'][0][1] as Record<string, unknown>).UF_CRM_TASK,
        ).toEqual(['D_500', 'CO_431']);
        expect(calls['rpaItem.add']).toBeUndefined();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('очередь смарта недоступна — отчёт всё равно успешен', async () => {
        const { useCase, dispatch } = makeUseCase({
            dispatchError: new Error('redis down'),
        });

        const result = await useCase.execute(dto() as never);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
    });
});
