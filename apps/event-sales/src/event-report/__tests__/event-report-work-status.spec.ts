import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventReportContext } from '../services/context/event-report.context';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../services/entity/event-report-entity-fields.model';
import {
    EEventReportEntityType,
    EventReportEntityType,
} from '../services/init/event-report-init.types';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * «ОП Статус Работы» обязан поддерживаться при ЛЮБОМ event-report
 * (todo2508-02 №9): активный план = клиент в работе, даже когда отчётный
 * workStatus не выбирался (чистый план после отказа). Одна модель обслуживает
 * компанию, лид и сделки — фикс автоматически чинит все сущности, включая
 * СОЗДАВАЕМУЮ отчётом сделку.
 */
const NOW = new Date('2026-08-25T09:00:00.000Z');

const WORK_STATUS_FIELD = {
    bitrixId: 'OP_WORK_STATUS',
    items: [
        { code: 'op_status_in_work', name: 'В работе', bitrixId: 301 },
        { code: 'op_status_fail', name: 'Провал', bitrixId: 302 },
    ],
};

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'x.bitrix24.ru' }),
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_work_status' ? WORK_STATUS_FIELD : undefined,
    getFieldItemByCode: (
        field: { items: Array<{ code: string; bitrixId: number }> },
        itemCode: string,
    ) => field.items.find(item => item.code === itemCode),
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
});

const makeCtx = (dto: Record<string, unknown>) =>
    new EventReportContext(
        { domain: 'x.bitrix24.ru', ...dto } as never,
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

const fieldsFor = (
    ctx: EventReportContext,
    entityType: EventReportEntityType = EEventReportEntityType.COMPANY,
) =>
    new EventReportEntityFieldsModel(
        makePortal() as never,
        ctx,
        entityType,
        entityType === EEventReportEntityType.DEAL
            ? { deal: null, role: EDealRole.BASE }
            : null,
    ).toFields();

describe('op_work_status: поддерживается при любом отчёте', () => {
    it('чистый план без отчётного статуса → «В работе» (компания)', () => {
        const ctx = makeCtx({
            plan: {
                isPlanned: true,
                isActive: true,
                name: 'цук',
                type: { current: { code: 'call', name: 'Звонок' } },
            },
            report: {},
        });
        expect(ctx.isPlanned).toBe(true);
        expect(fieldsFor(ctx).UF_CRM_OP_WORK_STATUS).toBe(301);
    });

    it('та же ветка чинит СОЗДАВАЕМУЮ сделку (роль base)', () => {
        const ctx = makeCtx({
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'call', name: 'Звонок' } },
            },
            report: {},
        });
        const fields = fieldsFor(ctx, EEventReportEntityType.DEAL);
        expect(fields.UF_CRM_OP_WORK_STATUS).toBe(301);
    });

    it('отказ по-прежнему пишет «Провал», план его не перебивает', () => {
        const ctx = makeCtx({
            plan: { isPlanned: true, isActive: true },
            report: { workStatus: { current: { code: 'fail' } } },
        });
        expect(fieldsFor(ctx).UF_CRM_OP_WORK_STATUS).toBe(302);
    });

    it('нет ни плана, ни финала — статус не утверждается', () => {
        const ctx = makeCtx({ report: {} });
        expect(fieldsFor(ctx).UF_CRM_OP_WORK_STATUS).toBeUndefined();
    });
});
