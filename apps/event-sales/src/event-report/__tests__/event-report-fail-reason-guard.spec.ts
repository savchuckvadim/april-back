import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportEntityFieldsModel } from '../services/entity/event-report-entity-fields.model';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import { EEventReportEntityType } from '../services/init/event-report-init.types';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * ПРИЧИНА ОТКАЗА пишется только тогда, когда менеджер её выбирал.
 *
 * Фронт показывает селект причины ТОЛЬКО при типе отказа «Отказ»
 * (`failure`, event-report-util.ts::applyFailType), но шлёт его ВСЕГДА —
 * `isActive` по проводам не едет. Из-за этого при восьми типах отказа из
 * девяти в карточку клиента и в KPI ложился дефолт селекта («Не было
 * времени»), которого менеджер не выбирал, и отчёт по причинам отказа врал.
 *
 * Гейт один на всех читателей — `EventReportContext.failReasonCode`.
 */
const NOW = new Date('2026-08-26T09:00:00.000Z');

const FAIL_REASON_KEY = 'UF_CRM_OP_EFIELD_FAIL_REASON';
const NOMONEY_BITRIX_ID = 555;

/** Типы отказа, при которых селект причины НЕ показывается (8 из 9). */
const FAIL_TYPES_WITHOUT_REASON = [
    'garant',
    'go',
    'territory',
    'accountant',
    'autsorc',
    'depend',
    'op_prospects_nophone',
    'op_prospects_company',
] as const;

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'd.b24.ru' }),
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_efield_fail_reason'
            ? {
                  bitrixId: 'OP_EFIELD_FAIL_REASON',
                  items: [
                      {
                          code: 'op_efield_fail_nomoney',
                          bitrixId: NOMONEY_BITRIX_ID,
                      },
                      { code: 'op_efield_fail_notime', bitrixId: 556 },
                  ],
              }
            : undefined,
    getFieldItemByCode: (
        field: { items: { code: string; bitrixId: number }[] },
        itemCode: string,
    ) => field.items.find(item => item.code === itemCode),
});

/**
 * Отчёт-отказ с выбранным типом и ПРИСЛАННОЙ причиной: ровно то, что шлёт
 * фронт — причина едет всегда, независимо от типа.
 */
const makeCtx = (over: {
    failTypeCode?: string;
    failTypeName?: string;
    workStatusCode?: string;
    notCaTypeCode?: string;
}) =>
    new EventReportContext(
        {
            currentTask: { eventType: 'hot', name: 'ООО Ромашка' },
            report: {
                resultStatus: 'result',
                workStatus: {
                    current: { code: over.workStatusCode ?? 'fail' },
                },
                failType: over.failTypeCode
                    ? {
                          current: {
                              code: over.failTypeCode,
                              name: over.failTypeName ?? '',
                          },
                      }
                    : undefined,
                failReason: {
                    current: { code: 'nomoney', name: 'Нет денег' },
                },
            },
            leadSync: over.notCaTypeCode
                ? { notCaTypeCode: over.notCaTypeCode }
                : undefined,
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

const fieldsOf = (ctx: EventReportContext) =>
    new EventReportEntityFieldsModel(
        makePortal() as never,
        ctx,
        EEventReportEntityType.COMPANY,
        null,
    ).toFields();

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const kpiOf = (ctx: EventReportContext) =>
    new EventReportKpiPayloadBuilder(
        makePortal() as never,
        ctx,
        deals,
    ).buildAll();

describe('Поля сущности: op_efield_fail_reason только при типе «Отказ»', () => {
    it('тип «Отказ» — причина пишется', () => {
        const out = fieldsOf(makeCtx({ failTypeCode: 'failure' }));
        expect(out[FAIL_REASON_KEY]).toBe(NOMONEY_BITRIX_ID);
    });

    it.each(FAIL_TYPES_WITHOUT_REASON)(
        'тип «%s» — причина НЕ пишется (селекта менеджер не видел)',
        failTypeCode => {
            const out = fieldsOf(makeCtx({ failTypeCode }));
            expect(FAIL_REASON_KEY in out).toBe(false);
        },
    );

    it('тип отказа не пришёл вовсе (старая сборка фрейма) — причина не пишется', () => {
        const out = fieldsOf(makeCtx({}));
        expect(FAIL_REASON_KEY in out).toBe(false);
    });

    it('«не ЦА» — отказные селекты не выбирались, причина не пишется', () => {
        const out = fieldsOf(
            makeCtx({
                failTypeCode: 'failure',
                notCaTypeCode: 'op_lead_not_ca_type1',
            }),
        );
        expect(FAIL_REASON_KEY in out).toBe(false);
    });

    /*
     * ИНВАРИАНТ расшивки дублирования: поле принадлежит ФИНАЛЬНОМУ отказу.
     * Менеджер мог открыть отказ, выбрать «Отказ», передумать и отчитаться
     * «в работе» — значения селектов остаются в состоянии фронта и уезжают
     * в DTO. Возражение живого клиента пишется в `op_objection_reason`.
     */
    it('отчёт НЕ отказом — причина не пишется, даже если селекты остались', () => {
        const out = fieldsOf(
            makeCtx({ failTypeCode: 'failure', workStatusCode: 'inJob' }),
        );
        expect(FAIL_REASON_KEY in out).toBe(false);
    });
});

describe('KPI: op_fail_reason гейтится тем же правилом', () => {
    it('тип «Отказ» — код причины во всех payload', () => {
        const payloads = kpiOf(makeCtx({ failTypeCode: 'failure' }));
        expect(payloads.length).toBeGreaterThan(0);
        for (const payload of payloads) {
            expect(payload.items.op_fail_reason).toBe('nomoney');
        }
    });

    it.each(FAIL_TYPES_WITHOUT_REASON)(
        'тип «%s» — op_fail_reason не заполняется',
        failTypeCode => {
            const payloads = kpiOf(makeCtx({ failTypeCode }));
            expect(payloads.length).toBeGreaterThan(0);
            for (const payload of payloads) {
                expect(payload.items.op_fail_reason).toBeUndefined();
            }
        },
    );

    it('нефинальный отчёт причину отказа в KPI не увозит', () => {
        const payloads = kpiOf(
            makeCtx({ failTypeCode: 'failure', workStatusCode: 'inJob' }),
        );
        for (const payload of payloads) {
            expect(payload.items.op_fail_reason).toBeUndefined();
        }
    });

    /*
     * Подпись финальной записи — тот же гейт: причина в имени только когда
     * её выбирали, иначе — имя ТИПА отказа.
     */
    it('имя финала: при «Отказе» — причина, при прочих типах — сам тип', () => {
        const withReason = kpiOf(
            makeCtx({ failTypeCode: 'failure', failTypeName: 'Отказ' }),
        ).find(p => p.items.event_type === 'ev_fail');
        expect(withReason!.name).toBe('Отказ: Звонок по решению — Нет денег');

        const withType = kpiOf(
            makeCtx({ failTypeCode: 'garant', failTypeName: 'Гарант/Запрет' }),
        ).find(p => p.items.event_type === 'ev_fail');
        expect(withType!.name).toBe('Отказ: Звонок по решению — Гарант/Запрет');
    });
});

/**
 * ТИП ОТКАЗА — тот же класс дефекта, что причина: справочник строится с
 * `current = items[0]` («Гарант/Запрет»), фронт шлёт его при ЛЮБОМ отчёте,
 * а гейт в KPI стоял только на «не ЦА». Результативный отчёт «в работе»
 * уносил в сводку тип отказа, которого не было.
 */
describe('KPI: op_fail_type только при настоящем отказе', () => {
    it('отчёт «в работе» НЕ пишет тип отказа (дефолт селекта не в счёт)', () => {
        const ctx = makeCtx({
            failTypeCode: 'garant',
            workStatusCode: 'inJob',
        });
        expect(ctx.failTypeCode).toBeNull();

        for (const payload of kpiOf(ctx)) {
            expect(payload.items.op_fail_type).toBeUndefined();
        }
    });

    it('продажа НЕ пишет тип отказа', () => {
        const ctx = makeCtx({
            failTypeCode: 'garant',
            workStatusCode: 'success',
        });

        for (const payload of kpiOf(ctx)) {
            expect(payload.items.op_fail_type).toBeUndefined();
        }
    });

    it('настоящий отказ пишет выбранный тип', () => {
        const payloads = kpiOf(makeCtx({ failTypeCode: 'territory' }));
        const final = payloads.find(p => p.items.event_type === 'ev_fail');

        expect(final!.items.op_fail_type).toBe('territory');
    });

    it('«не ЦА» тип отказа не выдумывает', () => {
        const ctx = makeCtx({
            failTypeCode: 'garant',
            notCaTypeCode: 'op_lead_not_ca_type1',
        });
        expect(ctx.failTypeCode).toBeNull();

        for (const payload of kpiOf(ctx)) {
            expect(payload.items.op_fail_type).toBeUndefined();
        }
    });

    it('перспективность при «в работе» тоже не пишется (свой гейт цел)', () => {
        const ctx = makeCtx({
            failTypeCode: 'garant',
            workStatusCode: 'inJob',
        });

        for (const payload of kpiOf(ctx)) {
            expect(payload.items.op_prospects_type).toBeUndefined();
        }
    });
});
