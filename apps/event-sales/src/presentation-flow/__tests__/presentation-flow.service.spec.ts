import { PBXService } from '@/modules/pbx';
import { PbxPresentationSmartService } from '@lib/portal-lib/pbx/pbx-presentation-smart';
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
    },
    stageIdByCode: {
        pres_new: 'DT1040_11:NEW',
        pres_plan: 'DT1040_11:PLAN',
        pres_pending: 'DT1040_11:PENDING',
        pres_success: 'DT1040_11:SUCCESS',
        pres_noresult: 'DT1040_11:NORESULT',
        pres_fail: 'DT1040_11:FAIL',
    },
};

const makeHarness = (over?: {
    info?: typeof INFO | null;
    openItems?: Array<Record<string, unknown>>;
    presentationsField?: boolean;
    /** Открытые сделки основной воронки компании (для дотяжки baseDealId). */
    companyDeals?: Array<{ ID: string; ASSIGNED_BY_ID?: string }>;
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

    return {
        service: new PresentationFlowService(pbx, presentationSmart),
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
        // Презентация не состоялась — даты проведения быть не должно.
        expect(fields.ufCrm8DoneDate).toBeUndefined();
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
        expect(call.filter.stageId).toEqual([
            'DT1040_11:NEW',
            'DT1040_11:PLAN',
            'DT1040_11:PENDING',
        ]);
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
});
