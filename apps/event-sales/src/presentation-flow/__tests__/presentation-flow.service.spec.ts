import { PBXService } from '@/modules/pbx';
import { PbxPresentationSmartService } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import {
    normalizeSmartFieldName,
    PbxSmartItemFieldsService,
    SmartItemField,
    SmartItemFields,
} from '@lib/portal-lib/pbx/smart-item-fields';
import { QuestionnaireSmartAnswer } from '../../shared/questionnaire-answers';
import {
    SideFlowBaseDealResolver,
    SideFlowName,
    SideFlowTaskBinderService,
} from '../../shared/side-flow';
import { PresentationFlowService } from '../presentation-flow.service';
import { PresentationFlowJobData } from '../dto/presentation-flow-job.dto';
import { PRESENTATION_OUTCOME } from '../lib/presentation-outcome';

/**
 * Сайд-flow презентаций: план создаёт элемент в «Запланирована» со связями
 * и план-комментарием; отчёт закрывает открытый элемент клиента (записывая
 * снимок анкеты), перенос оставляет его живым со счётчиком; спонтанная
 * презентация заводит НОВЫЙ элемент, не трогая запланированный; чужой
 * элемент не закрывается; без установленного смарта — тишина.
 */
const INFO = {
    entityTypeId: 1040,
    typeId: 8,
    ufKeyByCode: {
        PRES_BASE_DEAL: 'ufCrm8BaseDeal',
        PRES_DEAL: 'ufCrm8PresDeal',
        PRES_TMC_DEAL: 'ufCrm8TmcDeal',
        PRES_LEAD: 'ufCrm8Lead',
        PRES_COMPANY: 'ufCrm8Company',
        PRES_CONTACT: 'ufCrm8Contact',
        PRES_IS_OUR_REQUEST: 'ufCrm8OurRequest',
        PRES_PLAN_DATE: 'ufCrm8PlanDate',
        PRES_DONE_DATE: 'ufCrm8DoneDate',
        PRES_IS_SPONTANEOUS: 'ufCrm8Spont',
        PRES_RESPONSIBLE: 'ufCrm8Resp',
        PRES_PLAN_RESPONSIBLE: 'ufCrm8PlanResp',
        PRES_RESULT: 'ufCrm8Result',
        PRES_MOVE_COUNT: 'ufCrm8MoveCount',
        PRES_MOVE_DATE: 'ufCrm8MoveDate',
        PRES_FAIL_REASON: 'ufCrm8FailReason',
        PRES_5K_SUMMARY: 'ufCrm85kSummary',
        PRES_XVOST: 'ufCrm8Xvost',
        PRES_IS_OFFER: 'ufCrm8IsOffer',
        PRES_PLAN_COMMENT: 'ufCrm8PlanComment',
        PRES_REPORT_COMMENT: 'ufCrm8ReportComment',
        PRES_COMMENTS: 'ufCrm8Comments',
        PRES_LAST_CALL_DATE: 'ufCrm8LastCall',
        PRES_NEXT_CALL_DATE: 'ufCrm8NextCall',
    },
    enumItems: {
        PRES_RESULT: [
            { id: 301, code: 'pres_res_done', value: 'Состоялась' },
            { id: 302, code: 'pres_res_noresult', value: 'Не состоялась' },
            { id: 303, code: 'pres_res_moved', value: 'Перенесена' },
            { id: 304, code: 'pres_res_fail', value: 'Отказ' },
        ],
        PRES_FAIL_REASON: [
            { id: 401, code: 'pres_fail_notime', value: 'Не было времени' },
            { id: 402, code: 'pres_fail_c_price', value: 'Конкуренты - цена' },
        ],
    },
    stageIdByCode: {
        pres_new: 'DT1040_11:NEW',
        pres_approve: 'DT1040_11:APPROVE',
        pres_plan: 'DT1040_11:PLAN',
        pres_pending: 'DT1040_11:PENDING',
        pres_success: 'DT1040_11:SUCCESS',
        pres_rejected: 'DT1040_11:REJECTED',
        pres_noresult: 'DT1040_11:NORESULT',
        pres_fail: 'DT1040_11:FAIL',
    },
};

/**
 * ЖИВЫЕ поля элемента (crm.item.fields) — адреса портальной анкеты.
 * Их имена НЕ совпадают с кодами нашего реестра: анкета привязывается к
 * любому полю смарта, в том числе заведённому владельцем руками.
 */
const LIVE_FIELDS: SmartItemField[] = [
    {
        key: 'ufCrm8QDecision',
        upperName: 'UF_CRM_8_Q_DECISION',
        type: 'string',
        isMultiple: false,
        title: 'Кто решает',
        items: [],
    },
    {
        key: 'ufCrm8QBudget',
        upperName: 'UF_CRM_8_Q_BUDGET',
        type: 'money',
        isMultiple: false,
        title: 'Бюджет',
        items: [],
    },
    {
        key: 'ufCrm8QNextDate',
        upperName: 'UF_CRM_8_Q_NEXT_DATE',
        type: 'date',
        isMultiple: false,
        title: 'Дата решения',
        items: [],
    },
    {
        key: 'ufCrm8QMeetAt',
        upperName: 'UF_CRM_8_Q_MEET_AT',
        type: 'datetime',
        isMultiple: false,
        title: 'Когда встреча',
        items: [],
    },
    {
        key: 'ufCrm8QReady',
        upperName: 'UF_CRM_8_Q_READY',
        type: 'boolean',
        isMultiple: false,
        title: 'Готовы платить',
        items: [],
    },
    {
        key: 'ufCrm8QSource',
        upperName: 'UF_CRM_8_Q_SOURCE',
        type: 'enumeration',
        isMultiple: false,
        title: 'Откуда узнали',
        items: [
            { id: 701, value: 'Сайт' },
            { id: 702, value: 'Реклама' },
        ],
    },
    {
        key: 'ufCrm8QTags',
        upperName: 'UF_CRM_8_Q_TAGS',
        type: 'string',
        isMultiple: true,
        title: 'Метки',
        items: [],
    },
    // Поле НАШЕГО реестра: у него есть и код конфига, и справочник в
    // resolveInfo — на нём проверяется резолв варианта по коду.
    {
        key: 'ufCrm8FailReason',
        upperName: 'UF_CRM_8_PRES_FAIL_REASON',
        type: 'enumeration',
        isMultiple: false,
        title: 'Причина отказа',
        items: [
            { id: 401, value: 'Не было времени' },
            { id: 402, value: 'Конкуренты - цена' },
        ],
    },
    // Поле, которое заполняет САМ поток: ответ анкеты не должен его занять.
    {
        key: 'ufCrm8Result',
        upperName: 'UF_CRM_8_PRES_RESULT',
        type: 'enumeration',
        isMultiple: false,
        title: 'Результат',
        items: [{ id: 301, value: 'Состоялась' }],
    },
];

const ITEM_FIELDS: SmartItemFields = {
    entityTypeId: 1040,
    byNormalizedName: Object.fromEntries(
        LIVE_FIELDS.map(field => [
            normalizeSmartFieldName(field.upperName),
            field,
        ]),
    ),
};

/** Ответ анкеты: по умолчанию отчётный строковый. */
const answer = (
    over?: Partial<QuestionnaireSmartAnswer>,
): QuestionnaireSmartAnswer => ({
    key: 'q_pres:decision',
    purpose: 'report',
    fieldName: 'UF_CRM_8_Q_DECISION',
    fieldType: 'string',
    control: 'string' as QuestionnaireSmartAnswer['control'],
    value: 'Решает директор',
    title: 'Кто решает',
    optionTitle: null,
    ...over,
});

const makeHarness = (over?: {
    info?: typeof INFO | null;
    openItems?: Array<Record<string, unknown>>;
    presentationsField?: boolean;
    /** Открытые сделки основной воронки компании (для дотяжки baseDealId). */
    companyDeals?: Array<{ ID: string; ASSIGNED_BY_ID?: string }>;
    /** null — живые поля прочитать не удалось. */
    itemFields?: SmartItemFields | null;
}) => {
    const added: Array<Record<string, unknown>> = [];
    const updatedItems: Array<{ id: number; fields: Record<string, unknown> }> =
        [];
    const backRefUpdates: Array<{
        id: number;
        fields: Record<string, unknown>;
    }> = [];
    const listAllCalls: Array<{
        entityTypeId: string;
        filter: Record<string, unknown>;
        select?: string[];
    }> = [];

    const bitrix = {
        item: {
            add: (_typeId: string, fields: Record<string, unknown>) => {
                added.push(fields);
                return Promise.resolve({
                    result: { item: { id: 900 + added.length } },
                });
            },
            // listAll (не list!): сервис обязан листать ВСЕ открытые элементы
            // портала, а не первую страницу из 50 — контракт фиксируется
            // отдельным тестом на фильтр/select вызова.
            listAll: (
                entityTypeId: string,
                filter: Record<string, unknown>,
                select?: string[],
            ) => {
                listAllCalls.push({ entityTypeId, filter, select });
                return Promise.resolve(over?.openItems ?? []);
            },
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
                    result: { ID: '100', UF_CRM_OP_PRESENTATIONS: [] },
                }),
            getList: () =>
                Promise.resolve({ result: over?.companyDeals ?? [] }),
            update: (id: number, fields: Record<string, unknown>) => {
                backRefUpdates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
        company: {
            get: () => Promise.resolve({ result: { ID: '431' } }),
            update: (id: number, fields: Record<string, unknown>) => {
                backRefUpdates.push({ id, fields });
                return Promise.resolve({ result: true });
            },
        },
    };

    const portal = {
        getTimezone: () => 'Europe/Moscow',
        getEntityFieldByCode: () =>
            (over?.presentationsField ?? true)
                ? { bitrixId: 'OP_PRESENTATIONS' }
                : undefined,
        getFieldBitrixId: () => 'UF_CRM_OP_PRESENTATIONS',
        getDealCategoryByCode: () => ({ bitrixId: 5, stages: [] }),
    };

    const pbx = {
        init: () => Promise.resolve({ bitrix, PortalModel: portal }),
    } as unknown as PBXService;
    const presentationSmart = {
        resolveInfo: () =>
            Promise.resolve(over?.info === undefined ? INFO : over.info),
    } as unknown as PbxPresentationSmartService;

    const itemFieldsCalls: Array<{ domain: string; entityTypeId: number }> = [];
    const smartItemFields = {
        resolveFields: (domain: string, entityTypeId: number) => {
            itemFieldsCalls.push({ domain, entityTypeId });
            return Promise.resolve(
                over?.itemFields === undefined ? ITEM_FIELDS : over.itemFields,
            );
        },
    } as unknown as PbxSmartItemFieldsService;

    /*
     * Биндер — фейк с журналом вызовов: правило «к какой задаче привязан
     * элемент» живёт в ЭТОМ сервисе, а как именно пишется UF_CRM_TASK —
     * в side-flow-task-binder.service.spec.ts. Дотяжка сделки, наоборот,
     * берётся настоящая: её кейсы ниже проверяют результат целиком, через
     * тот же мок bitrix.deal.getList.
     */
    const bindCalls: Array<{
        taskId: number;
        entityTypeId: number;
        elementId: number;
        /** Имя потока — им общий сервис подписывает свои строки лога. */
        flow?: SideFlowName;
    }> = [];
    const taskBinder = {
        bind: (
            _bitrix: never,
            taskId: number,
            entityTypeId: number,
            elementId: number,
            flow?: SideFlowName,
        ) => {
            bindCalls.push({ taskId, entityTypeId, elementId, flow });
            return Promise.resolve();
        },
    } as unknown as SideFlowTaskBinderService;

    return {
        service: new PresentationFlowService(
            pbx,
            presentationSmart,
            smartItemFields,
            taskBinder,
            new SideFlowBaseDealResolver(),
        ),
        bindCalls,
        itemFieldsCalls,
        added,
        updatedItems,
        backRefUpdates,
        listAllCalls,
    };
};

const job = (
    over?: Partial<PresentationFlowJobData>,
): PresentationFlowJobData => ({
    domain: 'x.bitrix24.ru',
    operationId: 'op-1',
    kind: 'plan',
    outcome: PRESENTATION_OUTCOME.done,
    isResult: true,
    isSpontaneous: false,
    baseDealId: 100,
    presDealId: 77,
    tmcDealId: 55,
    failReasonCode: null,
    companyId: 431,
    leadId: 42,
    contactId: 9,
    responsibleId: 8,
    planResponsibleId: 12,
    planDeadline: '01.09.2026 10:00:00',
    planName: 'Демо СПС',
    planComment: 'Договорились на вторник',
    reportComment: null,
    survey: {},
    ...over,
});

describe('PresentationFlowService', () => {
    it('план: элемент в «Запланирована» со связями, ролями и лентой', async () => {
        const { service, added, backRefUpdates } = makeHarness();
        const result = await service.handle(job());

        expect(result.action).toBe('created');
        expect(added).toHaveLength(1);
        const fields = added[0];
        expect(fields.stageId).toBe('DT1040_11:PLAN');
        expect(fields.ufCrm8BaseDeal).toEqual(['D_100']);
        expect(fields.ufCrm8PresDeal).toEqual(['D_77']);
        // Связь с ТМЦ-сделкой — в самом элементе: после отказа от
        // pres-сделок обходной путь через UF_CRM_TO_PRESENTATION_SALES
        // перестанет существовать.
        expect(fields.ufCrm8TmcDeal).toEqual(['D_55']);
        expect(fields.ufCrm8Company).toEqual(['CO_431']);
        expect(fields.ufCrm8Lead).toEqual(['L_42']);
        expect(fields.ufCrm8Contact).toEqual(['C_9']);
        // Лид среди привязок = клиент «полностью наш» (пришёл заявкой).
        expect(fields.ufCrm8OurRequest).toBe('Y');
        // Назначил и провёл — разные люди.
        expect(fields.ufCrm8PlanResp).toBe(12);
        expect(fields.ufCrm8Resp).toBe(8);
        expect(fields.ufCrm8PlanDate).toBe('01.09.2026 10:00:00');
        expect(String((fields.ufCrm8Comments as string[])[0])).toContain(
            'План: Договорились на вторник',
        );
        // Обратная ссылка op_presentations: сделка + компания.
        expect(backRefUpdates).toHaveLength(2);
        expect(backRefUpdates[0].fields.UF_CRM_OP_PRESENTATIONS).toEqual([
            'T410_901',
        ]);
    });

    it('отчёт: открытый элемент закрывается «проведена» с анкетой и лентой', async () => {
        const { service, updatedItems, added } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                    ufCrm8Comments: ['01.08.2026 10:00:00 План: старое'],
                },
            ],
        });
        await service.handle(
            job({
                kind: 'report',
                reportComment: 'Показали демо',
                survey: {
                    PRES_5K_SUMMARY: 'Решает директор',
                    PRES_XVOST: 'Дожать через неделю',
                    PRES_IS_OFFER: 'Y',
                },
            }),
        );

        expect(added).toHaveLength(0);
        expect(updatedItems).toHaveLength(1);
        expect(updatedItems[0].id).toBe(601);
        const fields = updatedItems[0].fields;
        expect(fields.stageId).toBe('DT1040_11:SUCCESS');
        // Результат пишется ЧИСЛОВЫМ id значения enum, а не кодом.
        expect(fields.ufCrm8Result).toBe(301);
        expect(fields.ufCrm8DoneDate).toBeDefined();
        // Снимок анкеты уехал в СВОЙ элемент.
        expect(fields['ufCrm85kSummary']).toBe('Решает директор');
        expect(fields.ufCrm8Xvost).toBe('Дожать через неделю');
        expect(fields.ufCrm8IsOffer).toBe('Y');
        const comments = fields.ufCrm8Comments as string[];
        expect(comments[0]).toContain('Отчёт: Показали демо');
        expect(comments[1]).toContain('План: старое');
    });

    it('перенос: элемент уезжает в «Перенос», остаётся открытым, счётчик +1', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 602,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                    ufCrm8MoveCount: 1,
                },
            ],
        });
        const result = await service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.expired,
                isResult: false,
                planDeadline: '05.09.2026 12:00:00',
            }),
        );

        expect(result.action).toBe('moved');
        const fields = updatedItems[0].fields;
        expect(fields.stageId).toBe('DT1040_11:PENDING');
        expect(fields.ufCrm8Result).toBe(303);
        expect(fields.ufCrm8MoveCount).toBe(2);
        expect(fields.ufCrm8NextCall).toBe('05.09.2026 12:00:00');
        // Два РАЗНЫХ факта: КОГДА перенесли (сейчас) и НА КОГДА (дедлайн).
        expect(fields.ufCrm8MoveDate).toBeDefined();
        expect(fields.ufCrm8MoveDate).not.toBe(fields.ufCrm8NextCall);
        // Презентация не состоялась — даты проведения быть не должно.
        expect(fields.ufCrm8DoneDate).toBeUndefined();
    });

    it('отказ после презентации: причина уезжает снимком в элемент', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 605,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        await service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.fail,
                isResult: true,
                // Контекст отдаёт суффикс справочника op_efield_fail_*.
                failReasonCode: 'c_price',
            }),
        );

        const fields = updatedItems[0].fields;
        expect(fields.stageId).toBe('DT1040_11:FAIL');
        // Enum пишется ЧИСЛОВЫМ id значения, а не кодом.
        expect(fields.ufCrm8FailReason).toBe(402);
    });

    it('незнакомая причина отказа не пишется (справочник правили руками)', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 606,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        await service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.fail,
                isResult: true,
                failReasonCode: 'nonexistent',
            }),
        );

        // Лучше без причины, чем с несуществующим значением enum.
        expect(updatedItems[0].fields.ufCrm8FailReason).toBeUndefined();
        expect(updatedItems[0].fields.stageId).toBe('DT1040_11:FAIL');
    });

    it('перенос причину отказа не пишет — презентация ещё жива', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 607,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        await service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.expired,
                isResult: false,
                failReasonCode: 'notime',
            }),
        );
        expect(updatedItems[0].fields.ufCrm8FailReason).toBeUndefined();
    });

    it('отказ: встреча была → «Отказ после презентации», не была → «Не состоялась»', async () => {
        const openItem = {
            id: 603,
            stageId: 'DT1040_11:PLAN',
            ufCrm8BaseDeal: ['D_100'],
        };
        const withResult = makeHarness({ openItems: [openItem] });
        await withResult.service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.fail,
                isResult: true,
            }),
        );
        expect(withResult.updatedItems[0].fields.stageId).toBe(
            'DT1040_11:FAIL',
        );
        expect(withResult.updatedItems[0].fields.ufCrm8Result).toBe(304);

        const withoutResult = makeHarness({ openItems: [openItem] });
        await withoutResult.service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.fail,
                isResult: false,
            }),
        );
        expect(withoutResult.updatedItems[0].fields.stageId).toBe(
            'DT1040_11:NORESULT',
        );
        expect(withoutResult.updatedItems[0].fields.ufCrm8Result).toBe(302);
    });

    it('спонтанная: запланированный элемент не трогается, заводится новый закрытый', async () => {
        const { service, added, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 604,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        const result = await service.handle(
            job({ kind: 'report', isSpontaneous: true }),
        );

        expect(result.action).toBe('spontaneous');
        // План на другую дату остаётся живым — как unplanned pres-сделка.
        expect(updatedItems).toHaveLength(0);
        expect(added).toHaveLength(1);
        expect(added[0].stageId).toBe('DT1040_11:SUCCESS');
        expect(added[0].ufCrm8Spont).toBe('Y');
    });

    it('чужой открытый элемент (другая сделка) не закрывается', async () => {
        const { service, added, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 700,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_999'],
                },
            ],
        });
        await service.handle(job({ kind: 'report' }));
        expect(updatedItems).toHaveLength(0);
        expect(added).toHaveLength(1); // фиксируем факт НАШЕГО клиента
    });

    it('лид-only клиент: элемент находится по L_x и закрывается', async () => {
        const { service, added, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 610,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8Lead: ['L_42'],
                },
            ],
        });
        // Заявка без компании и сделки: у элемента есть только связь L_x.
        const result = await service.handle(
            job({ kind: 'report', baseDealId: null, companyId: null }),
        );

        expect(result.action).toBe('closed');
        expect(added).toHaveLength(0);
        expect(updatedItems).toHaveLength(1);
        expect(updatedItems[0].id).toBe(610);
    });

    it('чужой лид не матчится — фиксируется новый элемент', async () => {
        const { service, added, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 611,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8Lead: ['L_999'],
                },
            ],
        });
        await service.handle(
            job({ kind: 'report', baseDealId: null, companyId: null }),
        );
        expect(updatedItems).toHaveLength(0);
        expect(added).toHaveLength(1);
    });

    it('поиск открытого элемента: пагинированный listAll со стадийным фильтром и узким select', async () => {
        const { service, listAllCalls } = makeHarness({ openItems: [] });
        await service.handle(job({ kind: 'report' }));

        expect(listAllCalls).toHaveLength(1);
        const call = listAllCalls[0];
        expect(call.entityTypeId).toBe('1040');
        // Серверный фильтр — только открытые стадии (матч по связи — в JS).
        // Стадия согласования обязана быть среди них: иначе отчёт по
        // ждущей согласования заявке плодил бы спонтанные дубли.
        expect(call.filter.stageId).toEqual([
            'DT1040_11:NEW',
            'DT1040_11:APPROVE',
            'DT1040_11:PLAN',
            'DT1040_11:PENDING',
        ]);
        // Закрывающие стадии в поиск не попадают: отклонённая заявка и
        // отработанная презентация — законченные истории.
        expect(call.filter.stageId).not.toContain('DT1040_11:REJECTED');
        // Select обязан включать всё, что нужно матчу И последующему update:
        // без ленты/счётчика update затёр бы накопленные значения.
        expect(call.select).toEqual(
            expect.arrayContaining([
                'id',
                'ufCrm8BaseDeal',
                'ufCrm8Company',
                'ufCrm8Lead',
                'ufCrm8Comments',
                'ufCrm8MoveCount',
            ]),
        );
    });

    it('заявка на согласовании закрывается отчётом, а не дублируется', async () => {
        const { service, added, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 620,
                    stageId: 'DT1040_11:APPROVE',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        // Согласование ведут руками, но презентация по такой заявке всё
        // равно может состояться — элемент обязан закрыться, а не остаться
        // висеть с новым спонтанным рядом.
        const result = await service.handle(job({ kind: 'report' }));

        expect(result.action).toBe('closed');
        expect(added).toHaveLength(0);
        expect(updatedItems[0].id).toBe(620);
        expect(updatedItems[0].fields.stageId).toBe('DT1040_11:SUCCESS');
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
            companyDeals: [
                { ID: '321', ASSIGNED_BY_ID: '8' },
                { ID: '555', ASSIGNED_BY_ID: '8' },
            ],
        });
        const result = await service.handle(job({ baseDealId: null }));

        expect(result.action).toBe('created');
        // Свежая (максимальный id) открытая сделка основной воронки.
        expect(added[0].ufCrm8BaseDeal).toEqual(['D_555']);
    });

    it('дотяжка не подхватывает ЧУЖУЮ открытую сделку (правило 25.08)', async () => {
        const { service, added } = makeHarness({
            companyDeals: [
                // Строковый id ответственного — сравнение обязано быть числовым.
                { ID: '321', ASSIGNED_BY_ID: '8' },
                { ID: '999', ASSIGNED_BY_ID: '77' },
            ],
        });
        await service.handle(job({ baseDealId: null }));

        // Чужая 999 свежее, но элемент привязан к СВОЕЙ 321.
        expect(added[0].ufCrm8BaseDeal).toEqual(['D_321']);
    });

    // ─────────────────── элемент ↔ задача (UF_CRM_TASK) ───────────────────
    //
    // План привязывается к задаче, СОЗДАННОЙ этим же отчётом (её id приехал
    // из `$result[add_task]` того же батча), отчёт — к задаче, ПО КОТОРОЙ
    // отчитались. Раньше ветки плана не было вовсе.

    it('план: элемент привязан к СОЗДАННОЙ этим отчётом задаче', async () => {
        const { service, bindCalls } = makeHarness();
        const result = await service.handle(
            job({ kind: 'plan', planTaskId: 7001, taskId: 5001 }),
        );

        expect(result.elementId).toBe(901);
        expect(bindCalls).toEqual([
            {
                taskId: 7001,
                entityTypeId: 1040,
                elementId: 901,
                flow: 'pres-flow',
            },
        ]);
    });

    it('план без planTaskId: привязывать не к чему — джоб не падает', async () => {
        const { service, bindCalls, added } = makeHarness();
        const result = await service.handle(job({ kind: 'plan' }));

        // Задачи в батче не было (отчёт без плана-задачи) — элемент создан,
        // просто ни к чему не привязан.
        expect(result.action).toBe('created');
        expect(added).toHaveLength(1);
        expect(bindCalls).toHaveLength(0);
    });

    it('отчёт: элемент привязан к задаче, ПО КОТОРОЙ отчитались', async () => {
        const { service, bindCalls } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        await service.handle(
            job({ kind: 'report', taskId: 5001, planTaskId: 7001 }),
        );

        // planTaskId в report-джобе относится к СЛЕДУЮЩЕЙ задаче — этот
        // элемент закрывается по 5001 и привязан обязан быть к ней.
        expect(bindCalls).toEqual([
            {
                taskId: 5001,
                entityTypeId: 1040,
                elementId: 601,
                flow: 'pres-flow',
            },
        ]);
    });

    it('перенос: задача та же — привязка к ней же, а не к плановой', async () => {
        const { service, bindCalls } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        const result = await service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.expired,
                isResult: false,
                taskId: 5001,
                planTaskId: 7001,
            }),
        );

        expect(result.action).toBe('moved');
        expect(bindCalls).toEqual([
            {
                taskId: 5001,
                entityTypeId: 1040,
                elementId: 601,
                flow: 'pres-flow',
            },
        ]);
    });

    it('спонтанный отчёт без задачи: привязки нет, элемент создан', async () => {
        const { service, bindCalls, added } = makeHarness();
        const result = await service.handle(
            job({ kind: 'report', isSpontaneous: true, taskId: null }),
        );

        expect(result.action).toBe('spontaneous');
        expect(added).toHaveLength(1);
        expect(bindCalls).toHaveLength(0);
    });
    // ─────────────────── ответы портальной анкеты ───────────────────
    //
    // Ответ адресован полю ЭЛЕМЕНТА, а элемента на момент ответа ещё нет:
    // его создаёт или закрывает этот самый джоб. Поэтому проверяем все
    // четыре случая — плановый, закрываемый, перенесённый и спонтанный.

    it('план: ответ анкеты плана ложится в СОЗДАВАЕМЫЙ элемент', async () => {
        const { service, added, itemFieldsCalls } = makeHarness();
        await service.handle(
            job({
                answers: [
                    answer({ purpose: 'plan', value: 'Решает главбух' }),
                    answer({
                        key: 'q_pres:next',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_NEXT_DATE',
                        fieldType: 'date',
                        control: 'date' as QuestionnaireSmartAnswer['control'],
                        value: '2026-09-15',
                        title: 'Дата решения',
                    }),
                ],
            }),
        );

        expect(added).toHaveLength(1);
        expect(added[0].ufCrm8QDecision).toBe('Решает главбух');
        // Канон каталога (YYYY-MM-DD) → формат элемента.
        expect(added[0].ufCrm8QNextDate).toBe('15.09.2026');
        // Живые поля читаются РОВНО ОДИН раз и только когда ответы есть.
        expect(itemFieldsCalls).toEqual([
            { domain: 'x.bitrix24.ru', entityTypeId: 1040 },
        ]);
    });

    it('ответов нет — живые поля не читаются вовсе (горячий путь)', async () => {
        const { service, itemFieldsCalls } = makeHarness();
        await service.handle(job());
        expect(itemFieldsCalls).toHaveLength(0);
    });

    it('отчёт: в ЗАКРЫВАЕМЫЙ элемент едут только ответы отчёта', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        await service.handle(
            job({
                kind: 'report',
                answers: [
                    answer(),
                    // Ответ ПЛАНА в отчётный элемент не едет: он про
                    // следующую презентацию, а не про эту.
                    answer({
                        key: 'q_plan:budget',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_BUDGET',
                        fieldType: 'money',
                        control: 'money' as QuestionnaireSmartAnswer['control'],
                        value: '150000',
                        title: 'Бюджет',
                    }),
                ],
            }),
        );

        const fields = updatedItems[0].fields;
        expect(fields.ufCrm8QDecision).toBe('Решает директор');
        expect(fields.ufCrm8QBudget).toBeUndefined();
    });

    it('перенос: ответы отчёта пишутся, элемент остаётся открытым', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        const result = await service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.expired,
                answers: [answer()],
            }),
        );

        expect(result.action).toBe('moved');
        // Перенос — тоже отчёт менеджера: он рассказал, что выяснил.
        expect(updatedItems[0].fields.ufCrm8QDecision).toBe('Решает директор');
        // Снимок «5К»/«Хвост» при этом по-прежнему НЕ пишется.
        expect(updatedItems[0].fields['ufCrm85kSummary']).toBeUndefined();
    });

    it('перенос: анкета ПЛАНА едет в ТОТ ЖЕ элемент (план-джоба нет)', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        const result = await service.handle(
            job({
                kind: 'report',
                outcome: PRESENTATION_OUTCOME.expired,
                answers: [
                    answer(),
                    answer({
                        key: 'q_pres:budget',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_BUDGET',
                        fieldType: 'money',
                        control: 'money' as QuestionnaireSmartAnswer['control'],
                        value: '150000',
                    }),
                ],
            }),
        );

        // Перенос план-джоб не ставит (он завёл бы второй открытый
        // элемент), а анкету плана фрейм показал: новым планом стал этот
        // самый элемент — раньше ответ плана пропадал молча.
        expect(result.action).toBe('moved');
        expect(updatedItems[0].fields.ufCrm8QDecision).toBe('Решает директор');
        expect(updatedItems[0].fields.ufCrm8QBudget).toBe(150000);
    });

    it('спонтанная презентация: элемент рождается сразу с ответами', async () => {
        const { service, added, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        const result = await service.handle(
            job({ kind: 'report', isSpontaneous: true, answers: [answer()] }),
        );

        expect(result.action).toBe('spontaneous');
        // Чужой запланированный элемент не тронут.
        expect(updatedItems).toHaveLength(0);
        expect(added[0].ufCrm8QDecision).toBe('Решает директор');
    });

    it('канон каталога → формат Битрикса (деньги, да/нет, дата со временем)', async () => {
        const { service, added } = makeHarness();
        await service.handle(
            job({
                answers: [
                    answer({
                        key: 'q:budget',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_BUDGET',
                        fieldType: 'money',
                        control: 'money' as QuestionnaireSmartAnswer['control'],
                        value: '150000',
                    }),
                    answer({
                        key: 'q:ready',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_READY',
                        fieldType: 'boolean',
                        control:
                            'boolean' as QuestionnaireSmartAnswer['control'],
                        value: 'N',
                    }),
                    answer({
                        key: 'q:meet',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_MEET_AT',
                        fieldType: 'datetime',
                        control:
                            'datetime' as QuestionnaireSmartAnswer['control'],
                        value: '2026-09-15T10:30',
                    }),
                ],
            }),
        );

        expect(added[0].ufCrm8QBudget).toBe(150000);
        // «Нет» — это 1/0 поля Битрикса, а не пустота: иначе «нет»
        // читалось бы как «менеджер не отвечал».
        expect(added[0].ufCrm8QReady).toBe('0');
        // Настенное время портала, а не сдвиг из зоны сервера.
        expect(added[0].ufCrm8QMeetAt).toBe('15.09.2026 10:30:00');
    });

    it('вариант списка: код → ЧИСЛОВОЙ id по справочнику резолва', async () => {
        const { service, added } = makeHarness();
        await service.handle(
            job({
                answers: [
                    answer({
                        key: 'q:reason',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_PRES_FAIL_REASON',
                        fieldType: 'enumeration',
                        control:
                            'enumeration' as QuestionnaireSmartAnswer['control'],
                        value: 'pres_fail_c_price',
                        optionTitle: 'Конкуренты - цена',
                    }),
                ],
            }),
        );

        // Битрикс ждёт id значения, а не код.
        expect(added[0].ufCrm8FailReason).toBe(402);
    });

    it('вариант без кода в реестре резолвится ПОДПИСЬЮ живого списка', async () => {
        const { service, added } = makeHarness();
        await service.handle(
            job({
                answers: [
                    answer({
                        key: 'q:source',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_SOURCE',
                        fieldType: 'enumeration',
                        control:
                            'enumeration' as QuestionnaireSmartAnswer['control'],
                        value: 'reklama',
                        optionTitle: 'Реклама',
                    }),
                ],
            }),
        );

        expect(added[0].ufCrm8QSource).toBe(702);
    });

    it('неизвестный вариант списка не роняет джоб и поле не трогает', async () => {
        const { service, added } = makeHarness();
        const result = await service.handle(
            job({
                answers: [
                    answer({
                        key: 'q:source',
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_SOURCE',
                        fieldType: 'enumeration',
                        control:
                            'enumeration' as QuestionnaireSmartAnswer['control'],
                        // Значение справочника снесли на портале руками.
                        value: 'sarafan',
                        optionTitle: 'Сарафанное радио',
                    }),
                    answer({ purpose: 'plan' }),
                ],
            }),
        );

        expect(result.action).toBe('created');
        expect(added[0].ufCrm8QSource).toBeUndefined();
        // Соседний ответ при этом записан: одна беда не рушит остальные.
        expect(added[0].ufCrm8QDecision).toBe('Решает директор');
    });

    it('поля больше нет на портале — пропуск, а не запись наугад', async () => {
        const { service, added } = makeHarness();
        await service.handle(
            job({
                answers: [
                    answer({
                        purpose: 'plan',
                        fieldName: 'UF_CRM_8_Q_RENAMED',
                    }),
                ],
            }),
        );

        expect(added).toHaveLength(1);
        expect(added[0].ufCrm8QDecision).toBeUndefined();
    });

    it('множественное поле не заполняется (ответ ушёл бы в первый элемент)', async () => {
        const { service, added } = makeHarness();
        await service.handle(
            job({
                answers: [
                    answer({ purpose: 'plan', fieldName: 'UF_CRM_8_Q_TAGS' }),
                ],
            }),
        );

        expect(added[0].ufCrm8QTags).toBeUndefined();
    });

    it('служебное поле потока ответом анкеты не затирается', async () => {
        const { service, updatedItems } = makeHarness({
            openItems: [
                {
                    id: 601,
                    stageId: 'DT1040_11:PLAN',
                    ufCrm8BaseDeal: ['D_100'],
                },
            ],
        });
        await service.handle(
            job({
                kind: 'report',
                answers: [
                    answer({
                        key: 'q:result',
                        fieldName: 'UF_CRM_8_PRES_RESULT',
                        fieldType: 'enumeration',
                        control:
                            'enumeration' as QuestionnaireSmartAnswer['control'],
                        value: 'pres_res_done',
                        optionTitle: 'Состоялась',
                    }),
                ],
            }),
        );

        // Исход презентации считает поток, а не анкета портала.
        expect(updatedItems[0].fields.ufCrm8Result).toBe(301);
    });

    it('живые поля не прочитаны — ответы не пишутся, элемент создаётся', async () => {
        const { service, added } = makeHarness({ itemFields: null });
        const result = await service.handle(
            job({ answers: [answer({ purpose: 'plan' })] }),
        );

        expect(result.action).toBe('created');
        expect(added[0].ufCrm8QDecision).toBeUndefined();
        // Всё остальное на месте: ответы анкеты — дополнение, не условие.
        expect(added[0].stageId).toBe('DT1040_11:PLAN');
    });

    it('смарт не установлен — ответы никуда не пишутся, джоб пропущен', async () => {
        const { service, added, updatedItems } = makeHarness({ info: null });
        const warn = jest
            .spyOn(service['logger'], 'warn')
            .mockImplementation(() => undefined);
        const result = await service.handle(
            job({ answers: [answer({ purpose: 'plan' })] }),
        );

        expect(result.action).toBe('skipped');
        expect(added).toHaveLength(0);
        expect(updatedItems).toHaveLength(0);
        /*
         * Именно warning, а не debug: в проде debug выключен, и потеря
         * ответов менеджера была бы беззвучной. В строке — сколько
         * ответов потеряно.
         */
        expect(warn).toHaveBeenCalled();
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain('1 ответ(ов) портальной анкеты');
        expect(message).toContain('записать некуда');
    });

    it('смарт не установлен и ответов нет — предупреждать не о чем', async () => {
        const { service } = makeHarness({ info: null });
        const warn = jest
            .spyOn(service['logger'], 'warn')
            .mockImplementation(() => undefined);

        await service.handle(job());

        // Портал без смарта даёт этот пропуск на каждом отчёте — шуметь
        // в логе нечем, терять тоже нечего.
        expect(warn).not.toHaveBeenCalled();
    });
});
