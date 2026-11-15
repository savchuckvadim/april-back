import { closedLeadOf, dropClosedLeads } from '../closed-leads.filter';
import {
    DuplicateEntityType,
    DuplicateRawHit,
    DuplicateSignalKind,
} from '../../type/duplicate.type';

/**
 * Закрытые лиды (успех и брак) в поиске дублей скрываются, когда на портале
 * включено закрытие лидов по итогу работы (lead_closing_enabled, 15.11.2026).
 */
const hit = (
    entityType: DuplicateEntityType,
    id: number,
    closedLead?: boolean,
): DuplicateRawHit => ({
    entityType,
    id,
    kind: DuplicateSignalKind.PHONE,
    via: 'PHONE',
    value: '79001234567',
    closedLead,
});

describe('closedLeadOf', () => {
    it('лид в успехе или браке — закрыт, в работе — нет', () => {
        expect(
            closedLeadOf(DuplicateEntityType.LEAD, { STATUS_SEMANTIC_ID: 'S' }),
        ).toBe(true);
        expect(
            closedLeadOf(DuplicateEntityType.LEAD, { STATUS_SEMANTIC_ID: 'F' }),
        ).toBe(true);
        expect(
            closedLeadOf(DuplicateEntityType.LEAD, { STATUS_SEMANTIC_ID: 'P' }),
        ).toBe(false);
    });

    it('не лид или семантики нет — неизвестно', () => {
        expect(
            closedLeadOf(DuplicateEntityType.DEAL, { STATUS_SEMANTIC_ID: 'S' }),
        ).toBeUndefined();
        expect(closedLeadOf(DuplicateEntityType.LEAD, {})).toBeUndefined();
    });
});

describe('dropClosedLeads', () => {
    const hits = [
        hit(DuplicateEntityType.LEAD, 1, true),
        hit(DuplicateEntityType.LEAD, 2, false),
        hit(DuplicateEntityType.LEAD, 3),
        hit(DuplicateEntityType.COMPANY, 4),
    ];

    it('флаг включён — закрытые лиды уходят, остальное остаётся', () => {
        expect(dropClosedLeads(hits, true).map(h => h.id)).toEqual([2, 3, 4]);
    });

    it('флаг выключен — как раньше', () => {
        expect(dropClosedLeads(hits, false)).toHaveLength(4);
    });
});
