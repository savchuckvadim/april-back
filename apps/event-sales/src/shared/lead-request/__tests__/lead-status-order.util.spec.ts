import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { isLeadStatusBefore } from '../lead-status-order.util';

/**
 * «Статус лида назад не откатываем»: двигаем к «Взята в работу» только то,
 * что стоит раньше неё по воронке.
 */
const portal = (mapping: Record<string, string>): PortalModel =>
    ({
        getLeadStageCodeByStatusId: (statusId: string) => mapping[statusId],
    }) as unknown as PortalModel;

const TARGET = 'lead_taken_in_work';

describe('isLeadStatusBefore', () => {
    const mapped = portal({
        PBX_ASSIGNED: 'lead_assigned',
        UC_PRES: 'lead_pres',
        UC_WARM: 'lead_warm',
        PBX_TAKEN_IN_WORK: 'lead_taken_in_work',
    });

    it('«Назначена менеджеру» раньше «Взята в работу»', () => {
        expect(isLeadStatusBefore(mapped, 'PBX_ASSIGNED', TARGET)).toBe(true);
    });

    it('презентация и переговоры — дальше, не откатываем', () => {
        expect(isLeadStatusBefore(mapped, 'UC_PRES', TARGET)).toBe(false);
        expect(isLeadStatusBefore(mapped, 'UC_WARM', TARGET)).toBe(false);
    });

    it('та же стадия — не раньше', () => {
        expect(isLeadStatusBefore(mapped, 'PBX_TAKEN_IN_WORK', TARGET)).toBe(
            false,
        );
    });

    it('несопоставленный системный NEW узнаётся по шаблону', () => {
        expect(isLeadStatusBefore(portal({}), 'NEW', TARGET)).toBe(true);
        expect(isLeadStatusBefore(portal({}), 'IN_PROCESS', TARGET)).toBe(true);
    });

    it('пустой статус — раньше', () => {
        expect(isLeadStatusBefore(portal({}), '', TARGET)).toBe(true);
        expect(isLeadStatusBefore(portal({}), undefined, TARGET)).toBe(true);
    });

    it('неизвестный клиентский статус — не трогаем', () => {
        expect(isLeadStatusBefore(portal({}), 'UC_CUSTOM', TARGET)).toBe(false);
    });
});
