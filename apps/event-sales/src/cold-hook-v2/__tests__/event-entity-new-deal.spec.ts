import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { EnumColdCallEntityType } from '../dto/cold.dto';
import { EventEntityModel } from '../services/enities/entity/event-entity.model';

/**
 * Поля ХО в НОВОЙ сделке (основной и ХО-сделке): сущности ещё нет
 * (entity = null), но сопоставленные на портале поля обязаны писаться.
 * alfacentr 12.11.2026: сделки 203802/203804 ушли без единого поля ХО.
 */
const item = (code: string, bitrixId: number) => ({
    id: bitrixId,
    created_at: new Date(),
    updated_at: new Date(),
    bitrixfield_id: 1,
    name: code,
    title: code,
    code,
    bitrixId,
});

const FIELDS: Record<string, { bitrixId: string; items: unknown[] }> = {
    xo_name: { bitrixId: 'XO_NAME', items: [] },
    xo_date: { bitrixId: 'XO_DATE', items: [] },
    xo_responsible: { bitrixId: 'XO_RESPONSIBLE', items: [] },
    op_history: { bitrixId: 'OP_HISTORY', items: [] },
    op_mhistory: { bitrixId: 'OP_MHISTORY', items: [] },
    op_current_status: { bitrixId: 'OP_CURRENT_STATUS', items: [] },
    op_work_status: {
        bitrixId: 'OP_WORK_STATUS',
        items: [item('work', 11)],
    },
    // Поле есть в конфиге портала, но без bitrixId — писать некуда.
    call_next_name: { bitrixId: '', items: [] },
};

const portal = {
    getTimezone: () => ETimeZone.EUROPE_MOSCOW,
    getEntityFieldByCode: (_entity: string, code: string) => FIELDS[code],
} as unknown as PortalModel;

const deadline = BitrixDateTime.fromPortalInput(
    '24.11.2026 17:09:00',
    ETimeZone.EUROPE_MOSCOW,
);

const newDeal = () =>
    new EventEntityModel(
        portal,
        null,
        EnumColdCallEntityType.DEAL,
        'test new xo',
        deadline,
        '502',
        '502',
    );

describe('EventEntityModel — новая сделка (entity = null)', () => {
    it('пишет название, дату и ответственного ХО', () => {
        const values = newDeal().getNextValues();

        expect(values['UF_CRM_XO_NAME']).toBe('test new xo');
        expect(values['UF_CRM_XO_DATE']).toBe(deadline.toCrmDateTime());
        expect(values['UF_CRM_XO_RESPONSIBLE']).toBe('502');
    });

    it('текущий статус и рабочий статус «В работе»', () => {
        const values = newDeal().getNextValues();

        expect(values['UF_CRM_OP_CURRENT_STATUS']).toBe(
            'Холодный обзвон test new xo',
        );
        expect(values['UF_CRM_OP_WORK_STATUS']).toBe(11);
    });

    it('история — одна свежая запись о ХО, без «чужого» прошлого', () => {
        const values = newDeal().getNextValues();
        const history = values['UF_CRM_OP_MHISTORY'] as string[];

        expect(history).toHaveLength(1);
        expect(history[0]).toContain('ХО: test new xo');
        expect(String(values['UF_CRM_OP_HISTORY'])).toContain(
            'ХО: test new xo',
        );
    });

    it('не сопоставленное на портале поле не пишется', () => {
        const values = newDeal().getNextValues();

        // xo_created в конфиге нет вовсе, call_next_name — без bitrixId.
        expect(Object.keys(values)).not.toContain('UF_CRM_XO_CREATED');
        expect(Object.keys(values)).not.toContain('UF_CRM_');
    });
});
