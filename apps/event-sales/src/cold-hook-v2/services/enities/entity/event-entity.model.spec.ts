import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';
import { EventEntityModel } from './event-entity.model';

/**
 * Справочные поля холодного старта: «Рабочий статус» → «В работе»,
 * «Перспективность» → «Перспективная». В v1 перспективность искалась в
 * справочнике рабочего статуса и никогда не заполнялась (правка v2 02.09).
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
    op_work_status: {
        bitrixId: 'OP_WORK_STATUS',
        // Коды поля КАРТОЧКИ (не KPI-списка): «В работе» = `work`.
        items: [item('work', 11), item('op_status_fail', 12)],
    },
    op_prospects_type: {
        bitrixId: 'OP_PROSPECTS_TYPE',
        items: [item('op_prospects_good', 21), item('op_prospects_fail', 22)],
    },
    next_pres_plan_date: { bitrixId: 'NEXT_PRES_PLAN_DATE', items: [] },
};

const portal = {
    getTimezone: () => ETimeZone.EUROPE_MOSCOW,
    getEntityFieldByCode: (_entity: string, code: string) => FIELDS[code],
} as unknown as PortalModel;

const model = () =>
    new EventEntityModel(
        portal,
        { ID: '7' } as never,
        EnumColdCallEntityType.COMPANY,
        'ООО Ромашка',
        BitrixDateTime.fromPortalInput(
            '05.09.2026 11:00:00',
            ETimeZone.EUROPE_MOSCOW,
        ),
        '447',
        '1',
    );

describe('EventEntityModel — справочные поля холодного старта', () => {
    it('рабочий статус — «В работе» из справочника поля op_work_status', () => {
        expect(model().getNextValues()['UF_CRM_OP_WORK_STATUS']).toBe(11);
    });

    it('перспективность — «Перспективная» из СВОЕГО справочника', () => {
        expect(model().getNextValues()['UF_CRM_OP_PROSPECTS_TYPE']).toBe(21);
    });

    it('дата назначенной презентации обнуляется: презентации закрыты стартом', () => {
        expect(model().getNextValues()['UF_CRM_NEXT_PRES_PLAN_DATE']).toBe('');
    });
});
