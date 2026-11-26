import type { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import type { ReportGetFiltersDto } from '../dto/kpi-report-request.dto';
import {
    buildReportActions,
    findKpiListReportFields,
    isQueriedReportAction,
    reportEventColumns,
    reportEventColumnsOfList,
} from '../lib/report-actions.util';
import { ReportKpiUseCase } from '../use-cases/kpi-report.use-case';
import {
    fieldItem,
    KPI_LIST_FIELDS,
    KPI_LIST_REPORT_COLUMNS,
    listField,
} from './fixtures/kpi-list.fixture';

const [ACTION_FIELD, TYPE_FIELD] = KPI_LIST_FIELDS;

/** Расчёт отчёта на фикстуре: каждая команда батча отвечает «1». */
async function reportOnFixture() {
    const api = {
        addCmdBatch: jest.fn<void, [string, string, Record<string, unknown>]>(),
        callBatchWithConcurrency: jest.fn(() => {
            const keys = api.addCmdBatch.mock.calls.map(call => call[0]);
            const totals = Object.fromEntries(keys.map(key => [key, 1]));
            const chunk = {
                result: Object.fromEntries(keys.map(key => [key, []])),
                result_total: totals,
                result_error: [],
                result_next: [],
            } as unknown as IBitrixBatchResponseResult;
            return Promise.resolve([chunk]);
        }),
    };
    const pbx = {
        init: jest.fn(() =>
            Promise.resolve({
                portal: { id: 1 },
                bitrix: { api },
                PortalModel: {
                    getHook: () => 'https://hook',
                    getListByCode: (code: string) =>
                        code === 'sales_kpi'
                            ? { bitrixId: '55', bitrixfields: KPI_LIST_FIELDS }
                            : undefined,
                },
            }),
        ),
    };
    const useCase = new ReportKpiUseCase();
    await useCase.init('example.bitrix24.ru', pbx as never);
    return useCase.generateKpiReport({
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        departament: [{ ID: '1', NAME: 'Иван', LAST_NAME: 'Иванов' }],
    } as ReportGetFiltersDto);
}

describe('report-actions.util: поля списка KPI', () => {
    it('находит поля действия, типа, ответственного и даты по коду', () => {
        const found = findKpiListReportFields(KPI_LIST_FIELDS);

        expect(found.eventAction).toBe(ACTION_FIELD);
        expect(found.eventActionType).toBe(TYPE_FIELD);
        expect(found.actionId).toBe('PROPERTY_100');
        expect(found.actionTypeId).toBe('PROPERTY_101');
        expect(found.eventResponsibleId).toBe('PROPERTY_102');
        expect(found.dateFieldForHookFrom).toBe('>PROPERTY_103');
        expect(found.dateFieldForHookTo).toBe('<PROPERTY_103');
    });

    it('нет списка или полей — пусто, без падения', () => {
        expect(findKpiListReportFields(undefined)).toEqual({
            eventAction: null,
            eventActionType: null,
        });
        expect(
            findKpiListReportFields([listField('sales_kpi_crm', 'PROPERTY_9')]),
        ).toEqual({ eventAction: null, eventActionType: null });
    });
});

describe('report-actions.util: действия отчёта', () => {
    it('нераспознанные сочетания отброшены, порядок — по order колонок отчёта', () => {
        const actions = buildReportActions(
            ACTION_FIELD.items,
            TYPE_FIELD.items,
        );

        expect(actions.map(action => action.code)).toEqual([
            'xo_plan',
            'call_plan',
            'xo_done',
            'call_done',
            'presentation_plan',
            'presentation_done',
            'presentation_uniq_plan',
            'presentation_uniq_done',
            'ev_offer_act_send',
            'ev_success_done',
            'ev_fail_done',
        ]);
    });

    it('нет действий или типов — пусто', () => {
        expect(buildReportActions([], TYPE_FIELD.items)).toEqual([]);
        expect(buildReportActions(ACTION_FIELD.items, [])).toEqual([]);
    });

    it('из «Звонков» запрашиваются только call_plan и call_done, остальное — всё', () => {
        expect(
            isQueriedReportAction({ innerCode: 'call_plan', code: 'xo_plan' }),
        ).toBe(false);
        expect(
            isQueriedReportAction({
                innerCode: 'call_plan',
                code: 'call_plan',
            }),
        ).toBe(true);
        expect(
            isQueriedReportAction({
                innerCode: 'presentation_done',
                code: 'presentation_done',
            }),
        ).toBe(true);
    });
});

describe('report-actions.util: колонки таблицы событий', () => {
    it('колонки — как в отчёте: «План» и «Результативные» первыми, звонок один раз', () => {
        expect(reportEventColumnsOfList(KPI_LIST_FIELDS)).toEqual(
            KPI_LIST_REPORT_COLUMNS,
        );
    });

    it('совпадают с колонками строки, которую собирает ReportKpiUseCase', async () => {
        const report = await reportOnFixture();

        expect(
            report[0].kpi.map(kpi => ({
                innerCode: kpi.id,
                name: kpi.action.name,
            })),
        ).toEqual(KPI_LIST_REPORT_COLUMNS);
    });

    it('без звонков нет и «Плана»/«Результативных»: им не из чего взять название', () => {
        const actions = buildReportActions(
            [fieldItem('done', 'Факт', 12)],
            [fieldItem('presentation', 'Презентация', 23)],
        );

        expect(reportEventColumns(actions)).toEqual([
            { innerCode: 'presentation_done', name: ' Презентация' },
        ]);
    });

    it('портал без списка KPI или без поля действия — колонок нет', () => {
        expect(reportEventColumnsOfList(undefined)).toEqual([]);
        expect(reportEventColumnsOfList([TYPE_FIELD])).toEqual([]);
    });
});
