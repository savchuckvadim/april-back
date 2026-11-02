import { PBXService } from '@/modules/pbx/pbx.service';
import { EventSupportService } from '../services/event-support.service';
import { EventSupportStubService } from '../services/event-support-stub.service';

/**
 * Поддерживающие ручки фрейма — порт легаси: ТМЦ-сделки для кнопки «в ТМ»
 * и счётчики результатов по списку «ОП История».
 */
type Row = Record<string, unknown>;

/** Батч: записанные команды → ответ по словарю `key → result`. */
const makeBatch = (answers: Record<string, unknown>) => {
    const commands: { key: string; args: unknown[] }[] = [];
    const record =
        () =>
        (key: string, ...args: unknown[]) =>
            commands.push({ key, args });
    const callBatchWithConcurrency = jest.fn(() =>
        Promise.resolve([
            {
                result: Object.fromEntries(
                    commands
                        .splice(0)
                        .map(c => [c.key, answers[c.key] ?? null]),
                ),
                result_error: [],
                result_total: {},
            },
        ]),
    );
    return { commands, record, callBatchWithConcurrency };
};

const PRES_DEAL: Row = {
    ID: '198521',
    CATEGORY_ID: '101',
    UF_CRM_TO_BASE_TMC: '198467',
};
const TMC_DEAL: Row = {
    ID: '198467',
    CATEGORY_ID: '103',
    ASSIGNED_BY_ID: '611',
};

const makeService = (
    bitrix: Record<string, unknown>,
    portal: Record<string, unknown>,
) =>
    new EventSupportService(
        {
            init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portal }),
        } as unknown as PBXService,
        new EventSupportStubService(),
    );

describe('EventSupportService.getTmcDeals', () => {
    const portal = {
        getDealCategoryByCode: (code: string) =>
            code === 'sales_presentation' ? { bitrixId: 101 } : undefined,
        getEntityFieldByCode: (entity: string, code: string) =>
            entity === 'deal' && code === 'to_base_tmc'
                ? { bitrixId: 'TO_BASE_TMC' }
                : undefined,
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    };

    it('по сделке презентации из привязок задачи находит её ТМЦ-сделку', async () => {
        const batch = makeBatch({
            task_deal_198521: PRES_DEAL,
            task_deal_555: { ID: '555', CATEGORY_ID: '97' },
            tmc_deal_198467: TMC_DEAL,
        });
        const service = makeService(
            {
                batch: { deal: { get: batch.record() } },
                api: {
                    callBatchWithConcurrency: batch.callBatchWithConcurrency,
                },
            },
            portal,
        );

        const found = await service.getTmcDeals({
            domain: 'gsr.bitrix24.ru',
            tasks: [
                { id: 1, ufCrmTask: ['CO_95857', 'D_198521'] },
                { id: 2, ufCrmTask: ['D_555'] },
                { id: 3 },
            ],
        });

        expect(found).toEqual([
            { taskId: 1, tmcDeal: TMC_DEAL, presDeal: PRES_DEAL },
        ]);
        // Две пачки: сделки задач, затем ТМЦ-сделки.
        expect(batch.callBatchWithConcurrency).toHaveBeenCalledTimes(2);
    });

    it('без воронки презентаций или поля связи — пусто, в Битрикс не ходим', async () => {
        const batch = makeBatch({});
        const service = makeService(
            {
                batch: { deal: { get: batch.record() } },
                api: {
                    callBatchWithConcurrency: batch.callBatchWithConcurrency,
                },
            },
            { ...portal, getDealCategoryByCode: () => undefined },
        );
        await expect(
            service.getTmcDeals({
                domain: 'd.ru',
                tasks: [{ id: 1, ufCrmTask: ['D_1'] }],
            }),
        ).resolves.toEqual([]);
        expect(batch.callBatchWithConcurrency).not.toHaveBeenCalled();
    });
});

describe('EventSupportService.getResultCount', () => {
    const field = (camel: string, items: Record<string, number> = {}): Row => ({
        bitrixCamelId: camel,
        bitrixId: camel,
        items: Object.entries(items).map(([code, bitrixId]) => ({
            code,
            bitrixId,
        })),
    });
    const fields: Record<string, Row> = {
        crm: field('PROPERTY_1'),
        responsible: field('PROPERTY_2'),
        event_action: field('PROPERTY_3', { plan: 30, done: 31 }),
        event_type: field('PROPERTY_4', {
            presentation: 40,
            call_in_progress: 41,
            call_in_money: 42,
        }),
        op_result_status: field('PROPERTY_5', {
            op_call_result_yes: 51,
            op_call_result_no: 52,
        }),
    };
    const portal = {
        getListByCode: (code: string) =>
            code === 'sales_history' ? { bitrixId: 81 } : undefined,
        getIdByCodeFieldList: (_list: unknown, code: string) => fields[code],
    };

    it('пять фильтров легаси одной пачкой; счётчики — по числу записей', async () => {
        const batch = makeBatch({
            result: [{}, {}, {}],
            noresult: [{}],
            pres: [{}, {}],
            prog: [],
            money: [{}],
        });
        const service = makeService(
            {
                batch: { listItem: { get: batch.record() } },
                api: {
                    callBatchWithConcurrency: batch.callBatchWithConcurrency,
                },
            },
            portal,
        );
        const recorded = batch.commands;

        const counts = await service.getResultCount({
            domain: 'gsirk.bitrix24.ru',
            companyId: 42723,
            userId: 2185,
        });

        expect(counts).toEqual({
            resultCount: 3,
            noresultCount: 1,
            presentationCount: 2,
            inProgressCount: 0,
            inMoneyCount: 1,
        });
        expect(recorded).toEqual([]); // пачка отправлена
        const sent = (
            batch.callBatchWithConcurrency.mock.results[0] as unknown as {
                value: unknown;
            }
        ).value;
        expect(sent).toBeInstanceOf(Promise);
    });

    it('фильтры: компания + сотрудник, «состоялось» + результат «да», тип события; недозвон — результат «нет»', async () => {
        const commands: { key: string; dto: Row }[] = [];
        const service = makeService(
            {
                batch: {
                    listItem: {
                        get: (key: string, dto: Row) =>
                            commands.push({ key, dto }),
                    },
                },
                api: {
                    callBatchWithConcurrency: jest
                        .fn()
                        .mockResolvedValue([
                            { result: {}, result_error: [], result_total: {} },
                        ]),
                },
            },
            portal,
        );

        await service.getResultCount({
            domain: 'gsirk.bitrix24.ru',
            companyId: 42723,
            userId: 2185,
        });

        const byKey = Object.fromEntries(commands.map(c => [c.key, c.dto]));
        expect(byKey.result).toEqual({
            IBLOCK_ID: '81',
            select: ['ID'],
            filter: {
                PROPERTY_1: '%CO_42723%',
                PROPERTY_2: 2185,
                PROPERTY_5: 51,
                PROPERTY_3: 31,
            },
        });
        expect(byKey.noresult.filter).toEqual({
            PROPERTY_1: '%CO_42723%',
            PROPERTY_2: 2185,
            PROPERTY_5: 52,
        });
        expect((byKey.pres.filter as Row).PROPERTY_4).toBe(40);
        expect((byKey.prog.filter as Row).PROPERTY_4).toBe(41);
        expect((byKey.money.filter as Row).PROPERTY_4).toBe(42);
    });

    it('result_total важнее длины страницы', async () => {
        const service = makeService(
            {
                batch: { listItem: { get: jest.fn() } },
                api: {
                    callBatchWithConcurrency: jest.fn().mockResolvedValue([
                        {
                            result: { result: [{}], noresult: [] },
                            result_error: [],
                            result_total: { result: 73 },
                        },
                    ]),
                },
            },
            portal,
        );
        const counts = await service.getResultCount({
            domain: 'd.ru',
            companyId: 1,
            userId: 2,
        });
        expect(counts.resultCount).toBe(73);
        expect(counts.noresultCount).toBe(0);
    });

    it('списка или его полей нет — нули без запросов', async () => {
        const callBatchWithConcurrency = jest.fn();
        const service = makeService(
            {
                batch: { listItem: { get: jest.fn() } },
                api: { callBatchWithConcurrency },
            },
            { ...portal, getIdByCodeFieldList: () => undefined },
        );
        await expect(
            service.getResultCount({ domain: 'd.ru', companyId: 1, userId: 2 }),
        ).resolves.toEqual({
            noresultCount: 0,
            resultCount: 0,
            presentationCount: 0,
            inProgressCount: 0,
            inMoneyCount: 0,
        });
        expect(callBatchWithConcurrency).not.toHaveBeenCalled();
    });
});
