import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';

/**
 * garant 20.10.2026: отказ по задаче ХО «Холодный обзвон Холодный обзвон»
 * без следующего шага. Имя события из названия задачи не разбиралось (там
 * один пробел, а разбор ждёт «Звонок␣␣имя»), плана нет — отчётная запись
 * уходила с пустым «Название», и Битрикс её отвергал: KPI и история
 * холодного звонка терялись.
 */
const NOW = new Date('2026-10-20T07:17:00.000Z');

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: () => null,
});

const makeCtx = (currentTask: Record<string, unknown>) =>
    new EventReportContext(
        {
            currentTask,
            report: {
                resultStatus: 'noresult',
                workStatus: { current: { code: 'fail' } },
                failType: { current: { code: 'failure', name: 'Отказ' } },
                failReason: { current: { code: 'nomoney', name: 'Нет денег' } },
            },
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 178253,
            lead: null,
            company: { ID: '178253' },
            currentPresDeal: null,
        } as never,
        NOW,
    );

const build = (ctx: EventReportContext) =>
    new EventReportKpiPayloadBuilder(makePortal() as never, ctx, {
        baseDealId: '101259',
        newPlanPresDealId: null,
        newUnplannedPresDealId: null,
    }).buildAll();

describe('Имя записи KPI никогда не пустое', () => {
    it('отказ по задаче ХО без плана — отчётная запись «Холодный звонок»', () => {
        const payloads = build(
            makeCtx({
                eventType: 'xo',
                name: '',
                title: 'Холодный обзвон Холодный обзвон',
            }),
        );

        expect(payloads.length).toBeGreaterThan(0);
        for (const payload of payloads) {
            expect(payload.name.trim()).not.toBe('');
            expect(payload.values.event_title).toBe(payload.name);
        }
        expect(payloads.map(payload => payload.name)).toContain(
            'Холодный звонок',
        );
    });

    it('имя из задачи есть — берётся оно, как раньше', () => {
        const payloads = build(
            makeCtx({ eventType: 'xo', name: 'ООО Ромашка' }),
        );
        expect(payloads.map(payload => payload.name)).toContain('ООО Ромашка');
    });
});
