import { ReportKpiUseCase } from '../use-cases/kpi-report.use-case';
import { IncompleteBatchError } from '../../shared/lib/batch-completeness.util';
import type { ReportGetFiltersDto } from '../dto/kpi-report-request.dto';
import type { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

/**
 * Портал-фикстура: список sales_kpi c полями действия/типа/ответственного/
 * даты. ActionService из (plan|done) × (call|presentation) даёт 4 действия:
 * call_plan, call_done, presentation_plan, presentation_done → 4 команды
 * на сотрудника.
 */
const kpiListFixture = {
    bitrixId: '55',
    bitrixfields: [
        {
            code: 'sales_kpi_event_action',
            bitrixCamelId: 'PROPERTY_100',
            items: [
                { code: 'plan', name: 'План', bitrixId: 11 },
                { code: 'done', name: 'Факт', bitrixId: 12 },
            ],
        },
        {
            code: 'sales_kpi_event_type',
            bitrixCamelId: 'PROPERTY_101',
            items: [
                { code: 'call', name: 'Звонок', bitrixId: 21 },
                { code: 'presentation', name: 'Презентация', bitrixId: 22 },
            ],
        },
        { code: 'sales_kpi_responsible', bitrixCamelId: 'PROPERTY_102' },
        { code: 'sales_kpi_event_date', bitrixCamelId: 'PROPERTY_103' },
    ],
};

const EXPECTED_CODES = [
    'call_plan',
    'call_done',
    'presentation_plan',
    'presentation_done',
];

const chunk = (totals: Record<string, number>): IBitrixBatchResponseResult =>
    ({
        result: Object.fromEntries(Object.keys(totals).map(k => [k, []])),
        result_total: totals,
        result_error: [],
        result_next: [],
    }) as unknown as IBitrixBatchResponseResult;

const fullTotals = (userId: string): Record<string, number> => ({
    [`user_${userId}_action_call_plan`]: 3,
    [`user_${userId}_action_call_done`]: 2,
    [`user_${userId}_action_presentation_plan`]: 0,
    [`user_${userId}_action_presentation_done`]: 1,
});

const createMocks = (chunks: IBitrixBatchResponseResult[]) => {
    const api = {
        addCmdBatch: jest.fn<void, [string, string, Record<string, unknown>]>(),
        callBatchWithConcurrency: jest.fn(() => Promise.resolve(chunks)),
    };
    const pbx = {
        init: jest.fn(() =>
            Promise.resolve({
                portal: { id: 1 },
                bitrix: { api },
                PortalModel: {
                    getHook: () => 'https://hook',
                    getListByCode: (code: string) =>
                        code === 'sales_kpi' ? kpiListFixture : undefined,
                },
            }),
        ),
    };
    const cache = { setReady: jest.fn(() => Promise.resolve(undefined)) };
    return { api, pbx, cache };
};

const filters = (dateFrom: string, dateTo: string): ReportGetFiltersDto =>
    ({
        dateFrom,
        dateTo,
        userIds: ['1'],
        departament: [{ ID: '1', NAME: 'Иван', LAST_NAME: 'Иванов' }],
        userFieldId: '',
        dateFieldId: '',
        actionFieldId: '',
        currentActions: {},
    }) as ReportGetFiltersDto;

describe('ReportKpiUseCase', () => {
    it('строит команды по действиям с ISO-границами дат и вызывает strict-батч', async () => {
        const mocks = createMocks([chunk(fullTotals('1'))]);
        const useCase = new ReportKpiUseCase();
        await useCase.init('example.bitrix24.ru', mocks.pbx as never);

        await useCase.generateKpiReport(filters('01.06.2026', '01.07.2026'));

        expect(mocks.api.addCmdBatch).toHaveBeenCalledTimes(4);
        const keys = mocks.api.addCmdBatch.mock.calls.map(call => call[0]);
        expect(keys.sort()).toEqual(
            EXPECTED_CODES.map(code => `user_1_action_${code}`).sort(),
        );
        // Даты нормализованы: легаси 01.06–01.07 (to эксклюзивна) → июнь.
        const callPlanArgs = mocks.api.addCmdBatch.mock.calls.find(
            call => call[0] === 'user_1_action_call_plan',
        ) as unknown[];
        expect(callPlanArgs[2]).toEqual(
            expect.objectContaining({
                filter: expect.objectContaining({
                    '>PROPERTY_103': '2026-06-01',
                    '<PROPERTY_103': '2026-07-01',
                }) as Record<string, unknown>,
            }),
        );
        expect(mocks.api.callBatchWithConcurrency).toHaveBeenCalledWith(1, {
            strict: true,
        });
    });

    it('KPI на каждое действие (count 0 при нуле) + агрегаты result_communication', async () => {
        const mocks = createMocks([chunk(fullTotals('1'))]);
        const useCase = new ReportKpiUseCase();
        await useCase.init('example.bitrix24.ru', mocks.pbx as never);

        const report = await useCase.generateKpiReport(
            filters('2026-06-01', '2026-06-30'),
        );

        expect(report).toHaveLength(1);
        const kpiById = new Map(report[0].kpi.map(kpi => [kpi.id, kpi.count]));
        expect(kpiById.get('call_plan')).toBe(3);
        expect(kpiById.get('call_done')).toBe(2);
        expect(kpiById.get('presentation_plan')).toBe(0);
        expect(kpiById.get('presentation_done')).toBe(1);
        // Агрегаты: план = call_plan + presentation_plan, факт = call_done + presentation_done
        expect(kpiById.get('result_communication_plan')).toBe(3);
        expect(kpiById.get('result_communication_done')).toBe(3);
    });

    it('пропавшая команда → IncompleteBatchError, кэш НЕ записан', async () => {
        const totals = fullTotals('1');
        delete totals['user_1_action_presentation_done'];
        const mocks = createMocks([chunk(totals)]);
        const useCase = new ReportKpiUseCase();
        await useCase.init(
            'example.bitrix24.ru',
            mocks.pbx as never,
            mocks.cache as never,
        );

        await expect(
            useCase.generateKpiReport(filters('2026-06-01', '2026-06-30')),
        ).rejects.toBeInstanceOf(IncompleteBatchError);
        expect(mocks.cache.setReady).not.toHaveBeenCalled();
    });

    it('успех пишет ready-конверт результата (прошлый период → длинный TTL)', async () => {
        const mocks = createMocks([chunk(fullTotals('1'))]);
        const useCase = new ReportKpiUseCase();
        await useCase.init(
            'example.bitrix24.ru',
            mocks.pbx as never,
            mocks.cache as never,
        );

        await useCase.generateKpiReport(filters('2026-06-01', '2026-06-30'));

        expect(mocks.cache.setReady).toHaveBeenCalledWith(
            'kpi-report',
            'example.bitrix24.ru',
            'v1:result:2026-06-01_2026-06-30:1',
            expect.any(Array),
            30 * 24 * 3600,
        );
    });
});
