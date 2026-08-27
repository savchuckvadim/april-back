import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import { assertEventFlowDtoValid } from '../services/flow-guard/event-flow-guard';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * «Не ЦА» — брак, не отказ. По проводам едет отказом (fail) + notCaTypeCode
 * в leadSync (контракт очереди кода notCa не знает), но история и KPI обязаны
 * называть исход своим именем и НЕ выдумывать тип/причину отказа из дефолтов
 * селектов, которые менеджер не трогал.
 */
const NOW = new Date('2026-08-18T09:00:00.000Z');

const makePortal = (notCaItems = true) => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: (entity: string, code: string) =>
        notCaItems && entity === 'lead' && code === 'op_lead_not_ca_type'
            ? {
                  items: [
                      { code: 'op_lead_not_ca_type1', name: 'Квартира' },
                      {
                          code: 'op_lead_not_ca_type3',
                          name: 'Компания не существует',
                      },
                  ],
              }
            : undefined,
    getFieldItemByCode: (
        field: { items: Array<{ code: string; name: string }> },
        itemCode: string,
    ) => field.items.find(item => item.code === itemCode),
});

const makeCtx = (notCaTypeCode?: string) =>
    new EventReportContext(
        {
            currentTask: { eventType: 'hot', name: 'ООО Ромашка' },
            report: {
                resultStatus: 'result',
                // По проводам «не ЦА» едет отказом; отказные селекты — дефолты.
                workStatus: { current: { code: 'fail' } },
                failType: {
                    current: { code: 'garant', name: 'Гарант/Запрет' },
                },
                failReason: {
                    current: { code: 'fail_notime', name: 'Не было времени' },
                },
            },
            leadSync: notCaTypeCode ? { notCaTypeCode } : undefined,
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 431,
            lead: null,
            company: null,
            currentPresDeal: null,
        } as never,
        NOW,
    );

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const build = (ctx: EventReportContext) =>
    new EventReportKpiPayloadBuilder(
        makePortal() as never,
        ctx,
        deals,
    ).buildAll();

describe('KPI: «Не ЦА» вместо «Отказа»', () => {
    it('финал называется «Не ЦА» с именем типа из слепка', () => {
        const ctx = makeCtx('op_lead_not_ca_type1');
        expect(ctx.isNotCa).toBe(true);

        const final = build(ctx).find(p => p.items.event_type === 'ev_fail');
        expect(final).toBeDefined();
        expect(final!.name).toBe('Не ЦА: Звонок по решению — Квартира');
    });

    it('дефолтные тип/причина отказа НЕ пишутся, перспективность — nopersp', () => {
        const final = build(makeCtx('op_lead_not_ca_type1')).find(
            p => p.items.event_type === 'ev_fail',
        );
        expect(final!.items.op_fail_type).toBeUndefined();
        expect(final!.items.op_fail_reason).toBeUndefined();
        expect(final!.items.op_prospects_type).toBe('op_prospects_nopersp');
    });

    /*
     * Отказ типа «Гарант/Запрет»: селект ПРИЧИНЫ фронт не показывал, но
     * дефолт («Не было времени») по проводам прислал. Подписью финала идёт
     * ТИП отказа, а причина в items не пишется вовсе — раньше и подпись, и
     * KPI получали выдуманную причину.
     */
    it('обычный отказ не задет: имя «Отказ», тип на месте, причина не выдумана', () => {
        const final = build(makeCtx()).find(
            p => p.items.event_type === 'ev_fail',
        );
        expect(final!.name).toBe('Отказ: Звонок по решению — Гарант/Запрет');
        expect(final!.items.op_fail_type).toBe('garant');
        expect(final!.items.op_fail_reason).toBeUndefined();
        expect(final!.items.op_prospects_type).toBe('op_prospects_garant');
    });
});

describe('Guard POST /flow: согласованность «не ЦА»', () => {
    const dto = (workStatusCode: string, notCaTypeCode?: string) =>
        ({
            report: { workStatus: { current: { code: workStatusCode } } },
            leadSync: notCaTypeCode ? { notCaTypeCode } : undefined,
        }) as unknown as EventSalesFlowDto;

    it('fail + notCaTypeCode — валидно', () => {
        expect(() =>
            assertEventFlowDtoValid(dto('fail', 'op_lead_not_ca_type1')),
        ).not.toThrow();
    });

    it('notCaTypeCode при не-отказном статусе — 400', () => {
        expect(() =>
            assertEventFlowDtoValid(dto('inJob', 'op_lead_not_ca_type1')),
        ).toThrow(/не ЦА/);
    });

    it('без notCaTypeCode статус любой', () => {
        expect(() => assertEventFlowDtoValid(dto('inJob'))).not.toThrow();
        expect(() => assertEventFlowDtoValid(dto('success'))).not.toThrow();
    });
});
