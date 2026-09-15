import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

/**
 * КОНТАКТ ЭЛЕМЕНТА СПИСКА — СВОЙ У КАЖДОЙ ЗАПИСИ.
 *
 * Отчёт порождает ДВА разных элемента: «Отчёт» (по тому, что произошло) и
 * «План» (по следующему шагу). Менеджер может отчитаться по одному человеку,
 * а следующий шаг назначить на другого — и до 15.09 обе записи уезжали с
 * контактом ОТЧЁТА: `crm_contact` и привязка `C_*` брались из
 * `report.contact` жёстко. В карточке контакта плана записей не было вовсе.
 */
const NOW = new Date('2026-09-15T09:00:00.000Z');

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
});

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

/** Отчёт по звонку с планом следующего звонка на ДРУГОЙ контакт. */
const makeCtx = (
    over: {
        reportContactId?: string | null;
        planContactId?: string | null;
    } = {},
) =>
    new EventReportContext(
        {
            currentTask: { eventType: 'warm' },
            report: {
                resultStatus: 'result',
                contact:
                    over.reportContactId === null
                        ? null
                        : { ID: over.reportContactId ?? '56' },
            },
            plan: {
                isActive: true,
                isPlanned: true,
                type: { current: { code: 'hot' } },
                deadline: '23.09.2026 16:20:00',
                contact:
                    over.planContactId === null
                        ? null
                        : { ID: over.planContactId ?? '57' },
            },
        } as never,
        makePortal() as never,
        {
            entityType: 'deal',
            entityId: 500,
            currentPresDeal: null,
        } as never,
        NOW,
    );

const build = (ctx: EventReportContext) =>
    new EventReportKpiPayloadBuilder(
        makePortal() as never,
        ctx,
        deals,
    ).buildAll();

const byAction = (
    payloads: ReturnType<EventReportKpiPayloadBuilder['buildAll']>,
    action: string,
) => payloads.find(p => p.items.event_action === action);

describe('EventReportKpiPayloadBuilder — контакт элемента', () => {
    it('отчётная запись несёт контакт ОТЧЁТА, плановая — контакт ПЛАНА', () => {
        const payloads = build(makeCtx());

        expect(byAction(payloads, 'done')?.values.crm_contact).toEqual({
            n0: 'C_56',
        });
        expect(byAction(payloads, 'plan')?.values.crm_contact).toEqual({
            n0: 'C_57',
        });
    });

    it('привязка C_* идёт за контактом записи, а не за контактом отчёта', () => {
        const payloads = build(makeCtx());

        const links = (payload: (typeof payloads)[number]) =>
            Object.values(payload.values.crm ?? {});

        expect(links(byAction(payloads, 'done')!)).toContain('C_56');
        expect(links(byAction(payloads, 'done')!)).not.toContain('C_57');
        expect(links(byAction(payloads, 'plan')!)).toContain('C_57');
        expect(links(byAction(payloads, 'plan')!)).not.toContain('C_56');
    });

    it('контакт плана не выбран — плановая запись берёт контакт отчёта', () => {
        const payloads = build(makeCtx({ planContactId: null }));

        expect(byAction(payloads, 'plan')?.values.crm_contact).toEqual({
            n0: 'C_56',
        });
    });

    it('контактов нет вовсе — поля контакта у записей нет', () => {
        const payloads = build(
            makeCtx({ reportContactId: null, planContactId: null }),
        );

        expect(byAction(payloads, 'done')?.values.crm_contact).toBeUndefined();
        expect(byAction(payloads, 'plan')?.values.crm_contact).toBeUndefined();
    });
});
