import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { isRepeatRequestDeal } from '../repeat-request.util';

/**
 * Повтор узнаётся по связям сделки с лидами: чужой первоисточник либо лид
 * среди присоединённых к сделке без первоисточника (01.10.2026).
 */
const portal = (codes: string[]): PortalModel =>
    ({
        getEntityFieldByCode: (entity: string, code: string) =>
            entity === 'deal' && codes.includes(code)
                ? { bitrixId: code.toUpperCase() }
                : undefined,
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    }) as unknown as PortalModel;

const BOTH = portal(['deal_from_lead_id', 'deal_joined_leads']);

describe('isRepeatRequestDeal', () => {
    it('первоисточник — другой лид → повтор', () => {
        expect(
            isRepeatRequestDeal(
                BOTH,
                { UF_CRM_DEAL_FROM_LEAD_ID: 'L_339193' },
                348945,
            ),
        ).toBe(true);
    });

    it('первоисточник — сам лид (с префиксом и голым id) → своя сделка', () => {
        expect(
            isRepeatRequestDeal(
                BOTH,
                {
                    UF_CRM_DEAL_FROM_LEAD_ID: 'L_42',
                    UF_CRM_DEAL_JOINED_LEADS: ['L_42', 'L_43'],
                },
                42,
            ),
        ).toBe(false);
        expect(
            isRepeatRequestDeal(BOTH, { UF_CRM_DEAL_FROM_LEAD_ID: 42 }, 42),
        ).toBe(false);
    });

    it('первоисточника нет, лид среди присоединённых → повтор', () => {
        expect(
            isRepeatRequestDeal(
                BOTH,
                {
                    UF_CRM_DEAL_FROM_LEAD_ID: '',
                    UF_CRM_DEAL_JOINED_LEADS: ['L_7', 'L_42'],
                },
                42,
            ),
        ).toBe(true);
        expect(
            isRepeatRequestDeal(BOTH, { UF_CRM_DEAL_JOINED_LEADS: '42' }, 42),
        ).toBe(true);
    });

    it('первоисточника нет и лида нет среди присоединённых → не повтор', () => {
        expect(
            isRepeatRequestDeal(
                BOTH,
                { UF_CRM_DEAL_JOINED_LEADS: ['L_7'] },
                42,
            ),
        ).toBe(false);
        expect(isRepeatRequestDeal(BOTH, {}, 42)).toBe(false);
    });

    it('поле первоисточника не установлено — своё и чужое не различить, не повтор', () => {
        expect(
            isRepeatRequestDeal(
                portal(['deal_joined_leads']),
                { UF_CRM_DEAL_JOINED_LEADS: ['L_42'] },
                42,
            ),
        ).toBe(false);
    });
});
