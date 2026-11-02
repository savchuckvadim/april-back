import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportEntityFieldsModel } from '../services/entity/event-report-entity-fields.model';

/**
 * Поля компании в режиме «Менеджер ТМЦ»: пишется «Менеджер ТМЦ», а
 * «Менеджер ОП» не трогается (компания может вестись обоими отделами);
 * «ОП История» — с пометкой «ТМЦ» и лимитом 8 записей (легаси ТМЦ).
 */
const NOW = new Date('2026-11-02T09:00:00.000Z');

const FIELDS: Record<string, { bitrixId: string }> = {
    manager_op: { bitrixId: 'MANAGER_OP' },
    manager_tmc: { bitrixId: 'MANAGER_TMC' },
    op_mhistory: { bitrixId: 'OP_MHISTORY' },
};

const portal = {
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'gsr.bitrix24.ru' }),
    getEntityFieldByCode: (_entity: string, code: string) => FIELDS[code],
    getFieldItemByCode: () => undefined,
    getDealCategoryByCode: () => undefined,
} as unknown as PortalModel;

const history = Array.from({ length: 12 }, (_, i) => `старая запись ${i + 1}`);

const makeCtx = (mode: 'tmc' | 'sales'): EventReportContext =>
    new EventReportContext(
        {
            domain: 'gsr.bitrix24.ru',
            departament: { mode: { id: 2, code: mode, name: mode } },
            report: {
                resultStatus: 'result',
                description: 'Поговорили',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'warm', name: 'Звонок' } },
                name: 'Перезвонить',
                deadline: '2026-11-05T12:00:00',
                responsibility: { ID: 251 },
                createdBy: { ID: 251 },
            },
            currentTask: { id: 1, eventType: 'warm', name: 'Первый контакт' },
        } as never,
        portal as never,
        {
            entityType: 'company',
            entityId: 431,
            company: { ID: '431', UF_CRM_OP_MHISTORY: history },
            lead: null,
            currentBaseDeal: null,
            currentPresDeal: null,
        } as never,
        NOW,
    );

const fieldsOf = (mode: 'tmc' | 'sales'): Record<string, unknown> =>
    new EventReportEntityFieldsModel(
        portal,
        makeCtx(mode),
        'company',
    ).toFields();

describe('Поля компании в режиме ТМЦ', () => {
    it('ТМЦ пишет «Менеджер ТМЦ» и не трогает «Менеджера ОП»', () => {
        const fields = fieldsOf('tmc');
        expect(fields.UF_CRM_MANAGER_TMC).toBe(251);
        expect(fields).not.toHaveProperty('UF_CRM_MANAGER_OP');
    });

    it('отдел продаж — наоборот', () => {
        const fields = fieldsOf('sales');
        expect(fields.UF_CRM_MANAGER_OP).toBe(251);
        expect(fields).not.toHaveProperty('UF_CRM_MANAGER_TMC');
    });

    it('«ОП История» ТМЦ: новая запись с пометкой «ТМЦ» первой, лента режется до 8', () => {
        const entries = fieldsOf('tmc').UF_CRM_OP_MHISTORY as string[];
        expect(entries).toHaveLength(8);
        expect(entries[0]).toContain('ТМЦ Звонок совершён: Поговорили');
        expect(entries[1]).toBe('старая запись 1');
    });

    it('отдел продаж держит 12 записей без пометки', () => {
        const entries = fieldsOf('sales').UF_CRM_OP_MHISTORY as string[];
        expect(entries).toHaveLength(12);
        expect(entries[0]).toContain('Звонок совершён: Поговорили');
        expect(entries[0]).not.toContain('ТМЦ');
    });
});
