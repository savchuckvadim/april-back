import dayjs from 'dayjs';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

/**
 * Незапланированная презентация = ДВЕ KPI-записи с читаемой хронологией:
 * «запланирована» (plan, +0 с) → «состоялась» (done, +1 с).
 */
const NOW = new Date('2026-08-10T09:00:00.000Z');

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
});

const makeCtx = (over: { reportEventType?: string } = {}) =>
    new EventReportContext(
        {
            presentation: { isPresentationDone: true },
            currentTask: { eventType: over.reportEventType ?? 'xo' },
            report: {},
        } as never,
        makePortal() as never,
        {
            entityType: 'deal',
            entityId: 500,
            currentPresDeal: null,
        } as never,
        NOW,
    );

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const format = (date: Date) =>
    dayjs(date).tz('Europe/Moscow').format('DD.MM.YYYY HH:mm:ss');

describe('EventReportKpiPayloadBuilder — пара записей незапланированной презентации', () => {
    it('plan в момент события, done на +1 секунду позже', () => {
        const builder = new EventReportKpiPayloadBuilder(
            makePortal() as never,
            makeCtx(),
            deals,
        );
        const payloads = builder.buildAll();

        const plan = payloads.find(
            p =>
                p.items.event_type === 'presentation' &&
                p.items.event_action === 'plan',
        );
        const done = payloads.find(
            p =>
                p.items.event_type === 'presentation' &&
                p.items.event_action === 'done',
        );

        expect(plan).toBeDefined();
        expect(done).toBeDefined();
        expect(plan?.values.event_date).toBe(format(NOW));
        expect(done?.values.event_date).toBe(
            format(new Date(NOW.getTime() + 1000)),
        );
    });

    it('обычная (запланированная) презентация: done без смещения', () => {
        // report=presentation + живая pres-сделка → не unplanned.
        const ctx = new EventReportContext(
            {
                presentation: { isPresentationDone: true },
                currentTask: { eventType: 'presentation' },
                report: {},
            } as never,
            makePortal() as never,
            {
                entityType: 'deal',
                entityId: 500,
                currentPresDeal: { ID: '77' },
            } as never,
            NOW,
        );
        const payloads = new EventReportKpiPayloadBuilder(
            makePortal() as never,
            ctx,
            deals,
        ).buildAll();

        const done = payloads.find(
            p =>
                p.items.event_type === 'presentation' &&
                p.items.event_action === 'done',
        );
        expect(done?.values.event_date).toBe(format(NOW));
        // Пары «запланирована» нет — презентация была запланирована ранее.
        expect(
            payloads.some(
                p =>
                    p.items.event_type === 'presentation' &&
                    p.items.event_action === 'plan',
            ),
        ).toBe(false);
    });
});
