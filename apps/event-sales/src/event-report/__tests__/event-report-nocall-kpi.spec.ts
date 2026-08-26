import { EventReportContext } from '../services/context/event-report.context';
import { EventReportKpiFlowService } from '../services/kpi-list/event-report-kpi-flow.service';
import { EventReportKpiPayloadBuilder } from '../services/kpi-list/event-report-kpi-payload.builder';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

/**
 * Быстрый недозвон (isNoCall) обязан оставлять след (todo2508-02 №2):
 * запись «Не состоялся» в ОБА списка (sales_kpi + sales_history) с
 * привязками ко всем сущностям задачи (ufCrmTask). Раньше kpi-flow гейтился
 * `if (ctx.isNoCall) return` — быстрый недозвон из списка дел не писал
 * ни KPI, ни историю (в легаси работало: nodone → act_noresult_fail).
 *
 * Здесь же пин todo2508-02 №5: комментарий уходит batch-строкой, сырой `\n`
 * доезжает до элемента подчёркиванием — только `%0A` (toBatchText).
 */
const NOW = new Date('2026-08-25T12:00:00.000Z');

const makeList = (type: 'kpi' | 'history') => ({
    type,
    group: 'sales',
    bitrixId: type === 'kpi' ? 55 : 56,
    bitrixfields: [
        {
            code: `sales_${type}_event_type`,
            bitrixCamelId: 'P_TYPE',
            items: [
                { code: 'call', bitrixId: 1 },
                { code: 'presentation', bitrixId: 2 },
            ],
        },
        {
            code: `sales_${type}_event_action`,
            bitrixCamelId: 'P_ACTION',
            items: [
                { code: 'done', bitrixId: 30 },
                { code: 'plan', bitrixId: 10 },
                { code: 'act_noresult_fail', bitrixId: 60 },
            ],
        },
        { code: `sales_${type}_crm`, bitrixCamelId: 'P_CRM' },
        { code: `sales_${type}_manager_comment`, bitrixCamelId: 'P_COMMENT' },
    ],
});

const makeDeps = () => {
    const adds: { cmd: string; dto: Record<string, unknown> }[] = [];
    const bitrix = {
        listItem: { get: jest.fn() },
        batch: {
            listItem: {
                add: (cmd: string, dto: Record<string, unknown>) =>
                    adds.push({ cmd, dto }),
                update: jest.fn(),
            },
        },
    };
    const portal = {
        getTimezone: () => 'Europe/Moscow',
        getListByCode: (code: string) => {
            if (code === 'sales_kpi') return makeList('kpi');
            if (code === 'sales_history') return makeList('history');
            return undefined;
        },
    };
    const buffer = { queue: jest.fn((enqueue: () => void) => enqueue()) };
    const service = new EventReportKpiFlowService(
        bitrix as never,
        portal as never,
    );
    return { service, adds, buffer, portal };
};

const makeCtx = (over: Record<string, unknown> = {}) =>
    new EventReportContext(
        {
            currentTask: {
                id: 738563,
                eventType: 'warm',
                name: 'Звонок ОАО «ЗАВОД РТИ»',
                ufCrmTask: ['L_330743', 'D_25359'],
                ...((over.currentTask as object) ?? {}),
            },
            report: {
                resultStatus: null,
                isNoCall: true,
                description: 'Недозвон - трубку не берут',
                workStatus: { current: { code: 'inJob' } },
                noresultReason: { current: { code: 'nopickup' } },
                ...((over.report as object) ?? {}),
            },
            // Недозвон: план неактивен (buildFlowPayload гасит его сам).
            plan: { isPlanned: false, isActive: false },
        } as never,
        {
            getTimezone: () => 'Europe/Moscow',
            getEntityFieldByCode: () => null,
        } as never,
        {
            entityType: 'company',
            entityId: 7,
            lead: null,
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

describe('Быстрый недозвон (isNoCall) — KPI/история пишутся', () => {
    it('одна запись act_noresult_fail в оба списка (kpi + history)', async () => {
        const { service, adds, buffer } = makeDeps();

        await service.queue(makeCtx(), deals, buffer as never);

        // Ровно одна логическая запись × два списка; план/финал/uniq
        // у недозвона не бывает.
        expect(adds).toHaveLength(2);
        expect(adds.map(a => a.dto.IBLOCK_ID).sort()).toEqual(['55', '56']);
        for (const add of adds) {
            const fields = add.dto.FIELDS as Record<string, unknown>;
            expect(fields.P_TYPE).toBe(1); // warm → call
            expect(fields.P_ACTION).toBe(60); // act_noresult_fail
            expect(fields.NAME).toBe('Звонок ОАО «ЗАВОД РТИ»');
        }
    });

    it('привязки: владелец + ВСЕ сущности задачи (ufCrmTask), без дублей', async () => {
        const { service, adds, buffer } = makeDeps();

        await service.queue(makeCtx(), deals, buffer as never);

        const crm = (adds[0].dto.FIELDS as Record<string, unknown>)
            .P_CRM as Record<string, string>;
        const values = Object.values(crm);
        expect(values).toContain('CO_7');
        expect(values).toContain('L_330743');
        expect(values).toContain('D_25359');
        expect(new Set(values).size).toBe(values.length);
    });

    it('недозвон по задаче «Презентация» тоже пишется (легаси-ветка isNoCall)', async () => {
        const { service, adds, buffer } = makeDeps();

        await service.queue(
            makeCtx({ currentTask: { eventType: 'presentation' } }),
            deals,
            buffer as never,
        );

        expect(adds).toHaveLength(2);
        const fields = adds[0].dto.FIELDS as Record<string, unknown>;
        expect(fields.P_TYPE).toBe(2); // presentation
        expect(fields.P_ACTION).toBe(60);
    });

    it('комментарий недозвона в FIELDS — batch-safe: %0A вместо сырых \\n', async () => {
        const { service, adds, buffer } = makeDeps();

        await service.queue(
            makeCtx({
                report: {
                    resultStatus: null,
                    isNoCall: true,
                    description: 'первая строка\nвторая строка\n\nтретья',
                    workStatus: { current: { code: 'inJob' } },
                    noresultReason: { current: { code: 'nopickup' } },
                },
            }),
            deals,
            buffer as never,
        );

        const comment = (adds[0].dto.FIELDS as Record<string, unknown>)
            .P_COMMENT as string;
        expect(comment).toBe('первая строка%0Aвторая строка%0A%0Aтретья');
        expect(comment).not.toContain('\n');
    });
});

describe('Билдер при isNoCall — ровно одна отчётная запись', () => {
    it('план, финал и уникальные не строятся', () => {
        const payloads = new EventReportKpiPayloadBuilder(
            { getTimezone: () => 'Europe/Moscow' } as never,
            makeCtx(),
            deals,
        ).buildAll();

        expect(payloads).toHaveLength(1);
        expect(payloads[0].items.event_action).toBe('act_noresult_fail');
        expect(payloads[0].items.op_noresult_reason).toBe('nopickup');
        expect(payloads[0].dedup).toBeUndefined();
    });
});
