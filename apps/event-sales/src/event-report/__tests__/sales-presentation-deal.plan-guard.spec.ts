import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import { SalesPresentationDealService } from '../services/deal/sales-presentation-deal.service';

/**
 * Сделка «ОП Презентации» под план заводится только под включённый план и не
 * при переносе — один поток со смартом «Презентации». Раньше каждый перенос
 * (задача та же, task-flow двигает срок) заводил новую сделку без задачи, и
 * она висела в «План» навсегда; отказ с оставшимся в форме типом плана
 * «презентация» делал то же (garant, лид 279073, 07–30.10.2026).
 */
dayjs.extend(utc);
dayjs.extend(timezone);

const portal = {
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: () => undefined,
    getFieldBitrixId: () => '',
    getPortal: () => ({ domain: 'd.b24.ru' }),
    getDealCategoryByCode: () => ({
        bitrixId: '35',
        stages: [
            { code: 'spres_plan', bitrixId: 'PLAN' },
            { code: 'spres_pending', bitrixId: 'PENDING' },
            { code: 'spres_success', bitrixId: 'DONE' },
            { code: 'spres_noresult', bitrixId: 'APOLOGY' },
        ],
    }),
};

const PRESENTATION_PLAN = { code: 'presentation' };

const run = (dto: Record<string, unknown>, currentPresDeal: object | null) => {
    const calls: { method: string; cmd: string; args: unknown[] }[] = [];
    const record =
        (method: string) =>
        (cmd: string, ...args: unknown[]) =>
            calls.push({ method, cmd, args });
    const bitrix = {
        batch: { deal: { set: record('set'), update: record('update') } },
    };
    const ctx = new EventReportContext(
        {
            currentTask: { eventType: 'presentation', name: 'ООО Ромашка' },
            ...dto,
        } as never,
        portal as never,
        {
            entityType: 'company',
            entityId: 7,
            company: { ID: '7' },
            currentPresDeal,
        } as never,
        new Date('2026-10-07T09:00:00.000Z'),
    );
    const result = new SalesPresentationDealService(
        bitrix as never,
        portal as never,
    ).queue(ctx, '29435');
    return { calls, result };
};

describe('SalesPresentationDealService — сделка под план презентации', () => {
    it('включённый план презентации — новая сделка в «План»', () => {
        const { calls, result } = run(
            {
                report: { resultStatus: 'result' },
                plan: {
                    isPlanned: true,
                    isActive: true,
                    type: { current: PRESENTATION_PLAN },
                },
            },
            null,
        );

        expect(calls.filter(c => c.method === 'set')).toHaveLength(1);
        expect(result.newPlanPresDealId).toBe('$result[set_pres_deal]');
    });

    it('перенос — новой сделки нет, текущая уходит в «Перенесена»', () => {
        const { calls, result } = run(
            {
                report: { resultStatus: 'noresult' },
                plan: {
                    isPlanned: true,
                    isActive: true,
                    type: { current: PRESENTATION_PLAN },
                },
            },
            { ID: '95181' },
        );

        expect(calls.filter(c => c.method === 'set')).toHaveLength(0);
        expect(result.newPlanPresDealId).toBeNull();
        expect(calls).toEqual([
            expect.objectContaining({
                method: 'update',
                cmd: 'update_pres_deal_95181',
                args: [
                    95181,
                    expect.objectContaining({ STAGE_ID: 'C35:PENDING' }),
                ],
            }),
        ]);
    });

    it('план выключен, а тип «презентация» остался в форме — сделки нет', () => {
        const { calls } = run(
            {
                report: { resultStatus: 'result' },
                plan: {
                    isPlanned: false,
                    isActive: false,
                    type: { current: PRESENTATION_PLAN },
                },
            },
            null,
        );

        expect(calls.filter(c => c.method === 'set')).toHaveLength(0);
    });
});
