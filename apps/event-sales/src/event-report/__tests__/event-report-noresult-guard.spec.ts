import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportEntityFieldsModel } from '../services/entity/event-report-entity-fields.model';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import { EEventReportEntityType } from '../services/init/event-report-init.types';
import { KpiEventItemModel } from '../../shared/kpi-list-flow/models/kpi-event-item.model';
import { KpiEventPayload } from '../../shared/kpi-list-flow/type/kpi-event-payload.type';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Гард «типа нерезультативности» (легаси example legacy-flow.php:234-256,
 * потерян при переносе): фронт шлёт noresultReason ВСЕГДА (дефолт селекта —
 * «Недозвон - трубку не берут»), поэтому без гарда каждое результативное
 * событие и каждый финал получали в KPI/истории «недозвон».
 *
 * Контракт: result/new → явная очистка (null → '' в FIELDS, финал
 * upsert'ится); нерезультативные → код причины.
 */
const NOW = new Date('2026-08-18T09:00:00.000Z');

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    // Домен нужен модели полей: лимит истории на gsirk другой.
    getPortal: () => ({ domain: 'd.b24.ru' }),
});

const makeCtx = (resultStatus: string, workStatusCode = 'inJob') =>
    new EventReportContext(
        {
            currentTask: { eventType: 'warm', name: 'ООО Ромашка' },
            report: {
                resultStatus,
                workStatus: { current: { code: workStatusCode } },
                noresultReason: {
                    current: {
                        code: 'nopickup',
                        name: 'Недозвон - трубку не берут',
                    },
                },
                ...(workStatusCode === 'fail'
                    ? {
                          failReason: {
                              current: { code: 'nomoney', name: 'Нет денег' },
                          },
                      }
                    : {}),
            },
            plan:
                workStatusCode === 'inJob'
                    ? {
                          isActive: true,
                          type: { current: { code: 'warm' } },
                          deadline: '25.08.2026 09:00:00',
                      }
                    : {},
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

describe('KPI: гард op_noresult_reason', () => {
    it('результативный отчёт — явная очистка (null) во всех payload', () => {
        const payloads = build(makeCtx('result'));
        expect(payloads.length).toBeGreaterThan(0);
        for (const p of payloads) {
            expect(p.items.op_noresult_reason).toBeNull();
        }
    });

    it('нерезультативный отчёт — код причины пишется', () => {
        const payloads = build(makeCtx('noresult'));
        const report = payloads.find(p => p.items.event_action);
        expect(report).toBeDefined();
        for (const p of payloads) {
            expect(p.items.op_noresult_reason).toBe('nopickup');
        }
    });

    it('финал отказа при результативном разговоре — без «недозвона»', () => {
        const payloads = build(makeCtx('result', 'fail'));
        const final = payloads.find(p => p.items.event_type === 'ev_fail');
        expect(final).toBeDefined();
        expect(final!.items.op_noresult_reason).toBeNull();
    });
});

/**
 * Поля КАРТОЧКИ клиента обязаны гейтиться тем же правилом, что KPI.
 *
 * Расхождение было живым багом: `op_noresult_reason` в карточке писался при
 * любом нерезультативном статусе, включая «новое событие» — отчёт по кнопке
 * «новое событие» разговором не был, и клиент получал причину недозвона,
 * которой в отчётности (KPI) не существовало.
 */
describe('Поля сущности: op_noresult_reason тем же гейтом, что KPI', () => {
    const NORESULT_KEY = 'UF_CRM_OP_NORESULT_REASON';

    const portalWithField = () => ({
        getTimezone: () => 'Europe/Moscow',
        getPortal: () => ({ domain: 'd.b24.ru' }),
        getEntityFieldByCode: (_entity: string, code: string) =>
            code === 'op_noresult_reason'
                ? {
                      bitrixId: 'OP_NORESULT_REASON',
                      items: [{ code: 'nopickup', bitrixId: 77 }],
                  }
                : undefined,
        getFieldItemByCode: (
            field: { items: { code: string; bitrixId: number }[] },
            itemCode: string,
        ) => field.items.find(item => item.code === itemCode),
    });

    const fieldsFor = (resultStatus: string) =>
        new EventReportEntityFieldsModel(
            portalWithField() as never,
            makeCtx(resultStatus),
            EEventReportEntityType.COMPANY,
            null,
        ).toFields();

    it('недозвон — причина пишется', () => {
        expect(fieldsFor('noresult')[NORESULT_KEY]).toBe(77);
    });

    it('результативный разговор — причина не пишется', () => {
        expect(NORESULT_KEY in fieldsFor('result')).toBe(false);
    });

    it('НОВОЕ событие — причина недозвона не выдумывается', () => {
        expect(NORESULT_KEY in fieldsFor('new')).toBe(false);
    });
});

describe('KpiEventItemModel: null = очистка, undefined = не трогать', () => {
    const list = {
        group: 'sales',
        type: 'kpi',
        bitrixfields: [
            {
                code: 'sales_kpi_op_noresult_reason',
                bitrixCamelId: 'PROPERTY_123',
                items: [{ code: 'nopickup', bitrixId: 77 }],
            },
        ],
    };

    const fieldsFor = (
        opNoresultReason: KpiEventPayload['items']['op_noresult_reason'],
    ) =>
        new KpiEventItemModel(
            list as never,
            {
                name: 'x',
                values: {},
                items: { op_noresult_reason: opNoresultReason },
            } as KpiEventPayload,
        ).toFields();

    it('null пишет пустое значение — upsert финала затирает стейл', () => {
        expect(fieldsFor(null)['PROPERTY_123']).toBe('');
    });

    it('undefined не трогает поле', () => {
        expect('PROPERTY_123' in fieldsFor(undefined)).toBe(false);
    });

    it('код резолвится в bitrixId item’а', () => {
        expect(fieldsFor('nopickup')['PROPERTY_123']).toBe(77);
    });
});
