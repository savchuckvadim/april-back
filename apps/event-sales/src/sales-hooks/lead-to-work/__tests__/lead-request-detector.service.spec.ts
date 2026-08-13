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
        expect(result.kind).toBe('request');
        expect(result.signals.join(' ')).toContain('UF_CRM_REG_NUMBER');
    });

    it('наше поле op_lead_site_status заполнено → заявка', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        const result = detector.detect({
            ID: '42',
            UF_CRM_OP_LEAD_SITE_STATUS: 12,
        });
        expect(result.isRequest).toBe(true);
        expect(result.kind).toBe('request');
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
        expect(result.kind).toBe('cold');
        expect(result.signals).toHaveLength(0);
    });

    /*
     * SOURCE_ID — единственное штатное поле о ПРОИСХОЖДЕНИИ лида, поэтому
     * именно оно отличает заявку от входящего обращения. Роботы править не
     * нужно: поле заполняет сам Битрикс.
     */
    it.each(['WEB', 'WEBFORM', 'RC_GENERATOR', 'STORE'])(
        'SOURCE_ID=%s → заявка',
        source => {
            const detector = new LeadRequestDetectorService(makePortal(true));
            const result = detector.detect({ ID: '42', SOURCE_ID: source });
            expect(result.kind).toBe('request');
            expect(result.isRequest).toBe(true);
        },
    );

    it.each(['CALL', 'CALLBACK', 'EMAIL', 'IMOL', 'OPENLINE'])(
        'SOURCE_ID=%s → входящий лид',
        source => {
            const detector = new LeadRequestDetectorService(makePortal(true));
            const result = detector.detect({ ID: '42', SOURCE_ID: source });
            expect(result.kind).toBe('lead');
            // Обращение — тоже входящая работа: site-метки, таймер и SLA
            // у него те же, что у заявки.
            expect(result.isRequest).toBe(true);
        },
    );

    it('SOURCE_ID входящего обращения уточняет вид на пути заявки', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        const result = detector.detect({
            ID: '42',
            SOURCE_ID: 'CALL',
            UF_CRM_OP_LEAD_SITE_STATUS: 12,
        });
        expect(result.kind).toBe('lead');
    });

    /*
     * Лидоген надёжнее источника: «Код партнёра» ставит наш генератор
     * заявок, а SOURCE_ID менеджер мог переставить руками.
     */
    it('лидоген сильнее SOURCE_ID', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        const result = detector.detect({
            ID: '42',
            SOURCE_ID: 'CALL',
            UF_CRM_REG_NUMBER: '48-00691',
        });
        expect(result.kind).toBe('request');
    });

    /*
     * Кастомные источники портала (числовые id) смыслом не обладают — по ним
     * гадать нельзя, решает путь заявки.
     */
    it('кастомный SOURCE_ID сигналом не считается', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        expect(detector.detect({ ID: '42', SOURCE_ID: '17' }).kind).toBe(
            'cold',
        );
        expect(
            detector.detect({
                ID: '42',
                SOURCE_ID: '17',
                UF_CRM_OP_LEAD_SITE_STAGE: 5,
            }).kind,
        ).toBe('request');
    });
});
