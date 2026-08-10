import { LeadRequestDetectorService } from '../services/lead-request-detector.service';

const makePortal = (withSiteFields = false) =>
    ({
        getEntityFieldByCode: (entity: string, code: string) =>
            withSiteFields && code.startsWith('op_lead_site_')
                ? { bitrixId: code.toUpperCase(), items: [] }
                : undefined,
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    }) as never;

describe('LeadRequestDetectorService', () => {
    it('поле лидогена заполнено → заявка', () => {
        const detector = new LeadRequestDetectorService(makePortal());
        const result = detector.detect({
            ID: '42',
            TITLE: 'ООО Ромашка',
            UF_CRM_REG_NUMBER: '48-00691',
        });
        expect(result.isRequest).toBe(true);
        expect(result.signals.join(' ')).toContain('UF_CRM_REG_NUMBER');
    });

    it('наше поле op_lead_site_status заполнено → заявка', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        const result = detector.detect({
            ID: '42',
            UF_CRM_OP_LEAD_SITE_STATUS: 12,
        });
        expect(result.isRequest).toBe(true);
    });

    it('ничего не заполнено → просто лид', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        const result = detector.detect({
            ID: '42',
            TITLE: 'ООО Ромашка',
            UF_CRM_REG_NUMBER: '',
            UF_CRM_OP_LEAD_SITE_STATUS: 0,
        });
        expect(result.isRequest).toBe(false);
        expect(result.signals).toHaveLength(0);
    });
});
