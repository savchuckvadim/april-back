import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Финалы и уникальные презентации — по ЛЕГАСИ-схеме
 * (hook/app/Services/HookFlow/BitrixListFlowService.php:463-905, эталон
 * владельца):
 *
 *  - финал — запись с СОБСТВЕННЫМ типом ev_success/ev_fail в оба списка;
 *    отчётная запись по звонку пишется ПАРАЛЛЕЛЬНО (двойного счёта нет —
 *    типы разные). Отличие от легаси (сознательное, требование владельца):
 *    код финала детерминирован и повтор ОБНОВЛЯЕТ запись;
 *  - несостоявшийся разговор — act_noresult_fail, не expired;
 *  - уникальные презентации: копии записи с кодами легаси-формата
 *    `{owner}_{deal}_{action}` и `{owner}_{deal}_ {contact}_{action}`,
 *    только sales_kpi, insert-once;
 *  - слот владельца: КОМПАНИЯ (голый id — бук-в-букву легаси), а без неё —
 *    ЛИД с маркером `lead{id}` (расширение новой версии: маркер исключает
 *    коллизию с числовыми companyId; легаси лид-ключей не писал).
 */
const NOW = new Date('2026-08-18T09:00:00.000Z');

const makePortal = () => ({ getTimezone: () => 'Europe/Moscow' });

const makeCtx = (over: Record<string, unknown> = {}) =>
    new EventReportContext(
        {
            currentTask: { eventType: 'hot', name: 'ООО Ромашка' },
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'fail' } },
                failReason: { current: { code: 'nomoney', name: 'Нет денег' } },
            },
            ...((over.dto as object) ?? {}),
        } as never,
        makePortal() as never,
        {
            entityType: 'deal',
            entityId: 1024,
            lead: { ID: '42' },
            company: null,
            currentPresDeal: null,
            ...((over.init as object) ?? {}),
        } as never,
        NOW,
    );

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const build = (
    ctx: EventReportContext,
    dealsOver: Partial<DealFlowResult> = {},
) =>
    new EventReportKpiPayloadBuilder(makePortal() as never, ctx, {
        ...deals,
        ...dealsOver,
    }).buildAll();

describe('Финальная запись продажи/отказа (легаси-схема)', () => {
    it('отказ: финал ev_fail + done, имя подробное, upsert в оба списка', () => {
        const payloads = build(makeCtx());
        const final = payloads.find(p => p.items.event_type === 'ev_fail');

        expect(final).toBeDefined();
        expect(final!.items.event_action).toBe('done');
        expect(final!.name).toBe('Отказ: Звонок по решению — Нет денег');
        expect(final!.dedup).toEqual({
            key: 'final_deal_1024',
            scope: 'both',
            mode: 'upsert',
        });
    });

    it('при финале отчётная запись по звонку тоже пишется (типы разные — двойного счёта нет)', () => {
        const payloads = build(makeCtx());
        const report = payloads.find(
            p => p.items.event_type === 'call_in_progress',
        );
        expect(report).toBeDefined();
        expect(report!.items.event_action).toBe('done');
        expect(report!.dedup).toBeUndefined();
    });

    it('несостоявшийся разговор → act_noresult_fail (легаси), не expired', () => {
        const ctx = makeCtx({
            dto: {
                currentTask: { eventType: 'hot', name: 'ООО Ромашка' },
                report: {
                    resultStatus: 'noresult',
                    workStatus: { current: { code: 'fail' } },
                    failReason: {
                        current: { code: 'nomoney', name: 'Нет денег' },
                    },
                },
            },
        });
        const report = build(ctx).find(
            p => p.items.event_type === 'call_in_progress',
        );
        expect(report!.items.event_action).toBe('act_noresult_fail');
        // Финал при этом остаётся done — как в легаси (:3654).
        const final = build(ctx).find(p => p.items.event_type === 'ev_fail');
        expect(final!.items.event_action).toBe('done');
    });

    it('продажа со спонтанной презентацией: ev_success + «Продажа: спонтанная презентация»', () => {
        const ctx = makeCtx({
            dto: {
                currentTask: { eventType: 'warm', name: 'ООО Ромашка' },
                presentation: { isPresentationDone: true },
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'success' } },
                },
            },
        });
        const final = build(ctx).find(p => p.items.event_type === 'ev_success');
        expect(final!.name).toBe('Продажа: спонтанная презентация');
    });

    it('crm-привязки финала несут L_лид при владельце-сделке', () => {
        const final = build(makeCtx()).find(
            p => p.items.event_type === 'ev_fail',
        );
        const crm = Object.values(final!.values.crm ?? {});
        expect(crm).toContain('D_1024');
        expect(crm).toContain('L_42');
    });
});

describe('Уникальные презентации (легаси-коды)', () => {
    /** Компания-владелец с базовой сделкой и контактом — легаси-сценарий. */
    const presCtx = (over: Record<string, unknown> = {}) =>
        makeCtx({
            dto: {
                currentTask: {
                    eventType: 'presentation',
                    name: 'ООО Ромашка',
                },
                presentation: { isPresentationDone: true },
                report: { resultStatus: 'result', contact: { ID: 77 } },
                ...((over.dto as object) ?? {}),
            },
            init: {
                entityType: 'company',
                entityId: 7,
                lead: null,
                currentPresDeal: { ID: '900' },
                ...((over.init as object) ?? {}),
            },
        });

    it('done: пара uniq-записей с легаси-кодами, только sales_kpi, insert-once', () => {
        const payloads = build(presCtx(), { baseDealId: '500' });
        const company = payloads.find(
            p => p.items.event_type === 'presentation_uniq',
        );
        const contact = payloads.find(
            p => p.items.event_type === 'presentation_contact_uniq',
        );

        // Формулы легаси дословно (BitrixListFlowService.php:834, :899):
        expect(company!.dedup!.key).toBe('7_500_done');
        // Подчёркивание+ПРОБЕЛ — легаси-формат (:899), сохранён бук-в-букву.
        expect(contact!.dedup!.key).toBe('7_500_ 77_done');
        for (const uniq of [company!, contact!]) {
            expect(uniq.dedup!.scope).toBe('kpi');
            expect(uniq.dedup!.mode).toBe('insert-once');
            expect(uniq.dedup!.requireEventTypeItem).toBe(true);
            // Копия обычной записи: то же действие.
            expect(uniq.items.event_action).toBe('done');
        }
    });

    it('план презентации: uniq-plan с кодом {co}_{deal}_plan', () => {
        const ctx = makeCtx({
            dto: {
                report: { resultStatus: 'result' },
                plan: {
                    isPlanned: true,
                    isActive: true,
                    name: 'Презентация клиенту',
                    type: { current: { code: 'presentation' } },
                    contact: { ID: 88 },
                },
            },
            init: {
                entityType: 'company',
                entityId: 7,
                lead: null,
            },
        });
        const payloads = build(ctx, { baseDealId: '500' });
        const company = payloads.find(
            p => p.items.event_type === 'presentation_uniq',
        );
        const contact = payloads.find(
            p => p.items.event_type === 'presentation_contact_uniq',
        );
        expect(company!.dedup!.key).toBe('7_500_plan');
        // Контакт uniq-plan — контакт ПЛАНА (легаси :3634 planContactId).
        expect(contact!.dedup!.key).toBe('7_500_ 88_plan');
    });

    it('незапланированная презентация: uniq-plan пишется и БЕЗ result-гейта', () => {
        const ctx = makeCtx({
            dto: {
                currentTask: { eventType: 'warm', name: 'ООО Ромашка' },
                presentation: { isPresentationDone: true },
                report: { resultStatus: 'noresult' },
            },
            init: {
                entityType: 'company',
                entityId: 7,
                lead: null,
            },
        });
        const payloads = build(ctx, { baseDealId: '500' });
        const planUniq = payloads.filter(
            p =>
                p.items.event_type === 'presentation_uniq' &&
                p.items.event_action === 'plan',
        );
        // «План вхолостую» — легаси хардкодит result (:3517) → uniq есть.
        expect(planUniq).toHaveLength(1);
        expect(planUniq[0].dedup!.key).toBe('7_500_plan');
        // А uniq-done при noresult НЕ пишется (гейт :823).
        expect(
            payloads.some(
                p =>
                    p.items.event_type === 'presentation_uniq' &&
                    p.items.event_action === 'done',
            ),
        ).toBe(false);
    });

    /** Отчёт по презентации без компании — общий каркас для лид-кейсов. */
    const presNoCompanyCtx = (init: Record<string, unknown> = {}) =>
        makeCtx({
            dto: {
                currentTask: {
                    eventType: 'presentation',
                    name: 'ООО Ромашка',
                },
                presentation: { isPresentationDone: true },
                report: { resultStatus: 'result', contact: { ID: 77 } },
            },
            init: { currentPresDeal: { ID: '900' }, ...init },
        });

    /*
     * Расширение новой версии: компании нет, но есть лид — лид занимает
     * слот компании в ключе. Маркер `lead{id}` обязателен: id-пространства
     * компаний и лидов независимы, голый leadId мог бы численно совпасть
     * с чужим companyId.
     */
    it('без компании слот владельца занимает ЛИД с маркером lead{id}', () => {
        const payloads = build(presNoCompanyCtx(), { baseDealId: '500' });
        const company = payloads.find(
            p => p.items.event_type === 'presentation_uniq',
        );
        const contact = payloads.find(
            p => p.items.event_type === 'presentation_contact_uniq',
        );
        expect(company!.dedup!.key).toBe('lead42_500_done');
        expect(contact!.dedup!.key).toBe('lead42_500_ 77_done');
    });

    it('коллизии company=123 vs lead=123 нет: коды различаются маркером', () => {
        const byCompany = build(
            presNoCompanyCtx({
                entityType: 'company',
                entityId: 123,
                lead: null,
            }),
            { baseDealId: '500' },
        ).find(p => p.items.event_type === 'presentation_uniq');
        const byLead = build(presNoCompanyCtx({ lead: { ID: '123' } }), {
            baseDealId: '500',
        }).find(p => p.items.event_type === 'presentation_uniq');

        expect(byCompany!.dedup!.key).toBe('123_500_done');
        expect(byLead!.dedup!.key).toBe('lead123_500_done');
        expect(byCompany!.dedup!.key).not.toBe(byLead!.dedup!.key);
    });

    it('ни компании, ни лида → uniq не пишется (владельца ключа нет)', () => {
        const payloads = build(presNoCompanyCtx({ lead: null }), {
            baseDealId: '500',
        });
        expect(
            payloads.some(
                p =>
                    p.items.event_type === 'presentation_uniq' ||
                    p.items.event_type === 'presentation_contact_uniq',
            ),
        ).toBe(false);
    });

    /** Лид-only контекст: сделок нет вовсе (deals.baseDealId = null). */
    const leadOnlyCtx = () =>
        makeCtx({
            dto: {
                currentTask: {
                    eventType: 'presentation',
                    name: 'ООО Ромашка',
                },
                presentation: { isPresentationDone: true },
                report: { resultStatus: 'result', contact: { ID: 77 } },
            },
            init: {
                entityType: 'lead',
                entityId: 42,
                lead: { ID: '42' },
                currentPresDeal: { ID: '900' },
            },
        });

    /*
     * Решение владельца: lead-only работа без сделок — штатный случай,
     * uniq пишется с ключом БЕЗ deal-сегмента. Пустых `__` не бывает —
     * сегмент опускается целиком.
     */
    it('лид-only (сделок нет): uniq пишется без deal-сегмента', () => {
        const payloads = build(leadOnlyCtx());
        const company = payloads.find(
            p => p.items.event_type === 'presentation_uniq',
        );
        const contact = payloads.find(
            p => p.items.event_type === 'presentation_contact_uniq',
        );

        expect(company!.dedup!.key).toBe('lead42_done');
        expect(contact!.dedup!.key).toBe('lead42_ 77_done');
        for (const uniq of [company!, contact!]) {
            expect(uniq.dedup!.key).not.toContain('__');
            expect(uniq.dedup!.scope).toBe('kpi');
            expect(uniq.dedup!.mode).toBe('insert-once');
        }
    });

    it('работа доросла до сделки: ключ той же заявки меняется (две «уникальные» — ок)', () => {
        const withoutDeal = build(leadOnlyCtx()).find(
            p => p.items.event_type === 'presentation_uniq',
        );
        const withDeal = build(leadOnlyCtx(), { baseDealId: '500' }).find(
            p => p.items.event_type === 'presentation_uniq',
        );

        expect(withoutDeal!.dedup!.key).toBe('lead42_done');
        expect(withDeal!.dedup!.key).toBe('lead42_500_done');
        // Разные коды → обе записи сосуществуют (решение владельца:
        // «до сделки и после — это не страшно, оставляем»).
        expect(withoutDeal!.dedup!.key).not.toBe(withDeal!.dedup!.key);
    });

    it('финал лид-владельца дедуплицируется ключом final_lead_{id}', () => {
        const ctx = makeCtx({
            init: { entityType: 'lead', entityId: 42, lead: { ID: '42' } },
        });
        const final = build(ctx).find(p => p.items.event_type === 'ev_fail');
        expect(final!.dedup).toEqual({
            key: 'final_lead_42',
            scope: 'both',
            mode: 'upsert',
        });
    });

    it('обычные report/plan-записи дедупа не получают', () => {
        const ctx = makeCtx({
            dto: {
                currentTask: { eventType: 'warm', name: 'ООО Ромашка' },
                report: { resultStatus: 'result' },
                plan: {
                    isPlanned: true,
                    isActive: true,
                    name: 'Следующий звонок',
                    type: { current: { code: 'warm' } },
                },
            },
        });
        const payloads = build(ctx);
        expect(payloads.length).toBeGreaterThan(0);
        expect(payloads.every(p => p.dedup === undefined)).toBe(true);
    });
});
