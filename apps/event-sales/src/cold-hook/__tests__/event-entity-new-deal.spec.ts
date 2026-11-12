import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { EnumColdCallEntityType } from '../dto/cold.dto';
import { EventEntityModel } from '../services/enities/entity/event-entity.model';

/**
 * v1: поля ХО в НОВОЙ сделке (entity = null) — тот же дефект, что в v2
 * (alfacentr 12.11.2026): сопоставленные поля обязаны писаться.
 */
const FIELDS: Record<string, { bitrixId: string; items: unknown[] }> = {
    xo_name: { bitrixId: 'XO_NAME', items: [] },
    xo_date: { bitrixId: 'XO_DATE', items: [] },
    op_mhistory: { bitrixId: 'OP_MHISTORY', items: [] },
};

const portal = {
    getTimezone: () => ETimeZone.EUROPE_MOSCOW,
    getEntityFieldByCode: (_entity: string, code: string) => FIELDS[code],
} as unknown as PortalModel;

describe('EventEntityModel v1 — новая сделка (entity = null)', () => {
    const deadline = BitrixDateTime.fromPortalInput(
        '24.11.2026 17:09:00',
        ETimeZone.EUROPE_MOSCOW,
    );
    const values = () =>
        new EventEntityModel(
            portal,
            null,
            EnumColdCallEntityType.DEAL,
            'test new xo',
            deadline,
            '502',
            '502',
        ).getNextValues();

    it('пишет название и дату ХО', () => {
        expect(values()['UF_CRM_XO_NAME']).toBe('test new xo');
        expect(values()['UF_CRM_XO_DATE']).toBe(deadline.toCrmDateTime());
    });

    it('история — одна свежая запись', () => {
        const history = values()['UF_CRM_OP_MHISTORY'] as string[];
        expect(history).toHaveLength(1);
        expect(history[0]).toContain('ХО: test new xo');
    });

    it('не сопоставленное поле не пишется', () => {
        expect(Object.keys(values())).not.toContain('UF_CRM_XO_CREATED');
    });
});
