import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

/**
 * KPI в режиме «Менеджер ТМЦ» — как в легаси-сервисе ТМЦ: отчёт по
 * презентационной задаче не пишется вовсе (презентацию считает менеджер
 * ОП), записей о проведении и уникальных презентаций у ТМЦ нет; план и
 * обычный отчёт — как у всех, с привязкой к ТМЦ-сделке.
 */
const NOW = new Date('2026-11-02T09:00:00.000Z');

const makeCtx = (over: Record<string, unknown> = {}): EventReportContext =>
    new EventReportContext(
        {
            domain: 'gsr.bitrix24.ru',
            departament: { mode: { id: 2, code: 'tmc', name: 'ТМЦ' } },
            currentTask: {
                id: 1,
                eventType: 'presentation',
                name: 'Демо СПС',
                ufCrmTask: ['CO_431', 'D_500'],
            },
            report: {
                resultStatus: 'result',
                description: 'Презентация прошла',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'warm', name: 'Звонок' } },
                name: 'Перезвонить',
                deadline: '2026-11-05T12:00:00',
                responsibility: { ID: 251 },
                createdBy: { ID: 251 },
            },
            presentation: {
                count: { company: 0, smart: 0, deal: 0 },
                isPresentationDone: true,
                isUnplannedPresentation: false,
            },
            ...over,
        } as never,
        {
            getTimezone: () => 'Europe/Moscow',
            getEntityFieldByCode: () => undefined,
        } as never,
        {
            entityType: 'company',
            entityId: 431,
            company: { ID: '431' },
            lead: null,
            currentBaseDeal: { ID: '500' },
            currentPresDeal: null,
        } as never,
        NOW,
    );

const deals: DealFlowResult = {
    baseDealId: '500',
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const scenarios = (ctx: EventReportContext): string[] =>
    new EventReportKpiPayloadBuilder({} as never, ctx, deals)
        .buildAll()
        .map(payload => payload.scenario ?? '');

describe('KPI в режиме ТМЦ', () => {
    it('отчёт по презентационной задаче ТМЦ — ни отчётной, ни презентационных записей, только план', () => {
        expect(scenarios(makeCtx())).toEqual(['plan']);
    });

    it('тот же отчёт в режиме отдела продаж даёт презентационные записи', () => {
        const sales = scenarios(
            makeCtx({
                departament: {
                    mode: {
                        id: 1,
                        code: 'sales',
                        name: 'Менеджер по продажам',
                    },
                },
            }),
        );
        expect(sales).toContain('presentation_done');
        expect(sales).toContain('plan');
        expect(sales).not.toContain('report');
    });

    it('обычный звонок ТМЦ: отчётная запись с привязкой к ТМЦ-сделке и план', () => {
        const ctx = makeCtx({
            currentTask: {
                id: 1,
                eventType: 'warm',
                name: 'Первый контакт',
                ufCrmTask: ['CO_431', 'D_500'],
            },
            presentation: {
                count: { company: 0, smart: 0, deal: 0 },
                isPresentationDone: false,
                isUnplannedPresentation: false,
            },
        });
        const payloads = new EventReportKpiPayloadBuilder(
            {} as never,
            ctx,
            deals,
        ).buildAll();

        expect(payloads.map(payload => payload.scenario)).toEqual([
            'report',
            'plan',
        ]);
        const crm = Object.values(payloads[0].values.crm ?? {});
        expect(crm).toContain('D_500');
        expect(crm).toContain('CO_431');
    });

    it('недозвон по презентационной задаче ТМЦ тоже не пишется (легаси без исключения для недозвона)', () => {
        const ctx = makeCtx({
            report: {
                resultStatus: null,
                isNoCall: true,
                description: 'Недозвон',
                workStatus: { current: { code: 'inJob' } },
                noresultReason: { current: { code: 'nopickup' } },
            },
            plan: { isPlanned: false, isActive: false },
            presentation: {
                count: { company: 0, smart: 0, deal: 0 },
                isPresentationDone: false,
                isUnplannedPresentation: false,
            },
        });
        expect(scenarios(ctx)).toEqual([]);
    });
});
