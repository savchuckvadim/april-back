import { LeadRequestDetectorService } from '../services/lead-request-detector.service';

/** items НАШЕГО поля вида работы — как они приходят из слепка портала. */
const WORK_KIND_ITEMS = [
    { code: 'op_lead_work_kind1', bitrixId: 101 },
    { code: 'op_lead_work_kind2', bitrixId: 102 },
    { code: 'op_lead_work_kind3', bitrixId: 103 },
];

/**
 * `withWorkKindField` — наше поле вида работы заведено на портале.
 * Пока владелец его не создал, детектор обязан работать как раньше.
 */
const makePortal = (withSiteFields = false, withWorkKindField = false) =>
    ({
        getEntityFieldByCode: (_entity: string, code: string) => {
            if (code === 'op_lead_work_kind') {
                return withWorkKindField
                    ? { bitrixId: 'OP_LEAD_WORK_KIND', items: WORK_KIND_ITEMS }
                    : undefined;
            }
            return withSiteFields && code.startsWith('op_lead_site_')
                ? { bitrixId: code.toUpperCase(), items: [] }
                : undefined;
        },
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

    /* ------------------------------------------------------------------ *
     * НАШЕ поле вида работы — источник истины.
     * ------------------------------------------------------------------ */

    it.each([
        [101, 'cold', false],
        [102, 'request', true],
        [103, 'lead', true],
    ] as const)(
        'наше поле op_lead_work_kind=%s → %s',
        (bitrixId, kind, isRequest) => {
            const detector = new LeadRequestDetectorService(
                makePortal(true, true),
            );
            const result = detector.detect({
                ID: '42',
                UF_CRM_OP_LEAD_WORK_KIND: bitrixId,
            });
            expect(result.kind).toBe(kind);
            expect(result.isRequest).toBe(isRequest);
            expect(result.signals.join(' ')).toContain('op_lead_work_kind');
        },
    );

    /*
     * Наше поле сильнее ВСЕГО остального: оно и заведено ради того, чтобы
     * переживать ручные правки чужих полей и разницу настроек порталов.
     */
    it('наше поле сильнее лидогена, меток пути и SOURCE_ID', () => {
        const detector = new LeadRequestDetectorService(makePortal(true, true));
        const result = detector.detect({
            ID: '42',
            UF_CRM_OP_LEAD_WORK_KIND: 101, // холодный
            UF_CRM_REG_NUMBER: '48-00691', // лидоген говорит «заявка»
            UF_CRM_OP_LEAD_SITE_STATUS: 12, // метки говорят «входящая»
            SOURCE_ID: 'CALL', // источник говорит «лид»
        });
        expect(result.kind).toBe('cold');
    });

    it('наше поле не заведено на портале → работаем по прежним признакам', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        const result = detector.detect({
            ID: '42',
            UF_CRM_OP_LEAD_WORK_KIND: 103,
            UF_CRM_REG_NUMBER: '48-00691',
        });
        expect(result.kind).toBe('request');
    });

    it('наше поле заведено, но пустое → идём по прежним признакам', () => {
        const detector = new LeadRequestDetectorService(makePortal(true, true));
        const result = detector.detect({
            ID: '42',
            UF_CRM_OP_LEAD_WORK_KIND: 0,
            UF_CRM_REG_NUMBER: '48-00691',
        });
        expect(result.kind).toBe('request');
    });

    /* ------------------------------------------------------------------ *
     * Лидоген — второй по силе, метки пути — третий.
     * ------------------------------------------------------------------ */

    it('лидоген сильнее меток пути и SOURCE_ID', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        const result = detector.detect({
            ID: '42',
            SOURCE_ID: 'CALL',
            UF_CRM_OP_LEAD_SITE_STATUS: 12,
            UF_CRM_REG_NUMBER: '48-00691',
        });
        expect(result.kind).toBe('request');
    });

    /* ------------------------------------------------------------------ *
     * SOURCE_ID — чужое поле: слабее всех и НЕ делает работу входящей.
     * ------------------------------------------------------------------ */

    it.each(['CALL', 'CALLBACK', 'EMAIL', 'IMOL', 'OPENLINE', 'WEB', 'STORE'])(
        'SOURCE_ID=%s сам по себе холодный лид входящим НЕ делает',
        source => {
            const detector = new LeadRequestDetectorService(makePortal(true));
            const result = detector.detect({ ID: '42', SOURCE_ID: source });
            expect(result.kind).toBe('cold');
            expect(result.isRequest).toBe(false);
        },
    );

    it('SOURCE_ID уточняет вид ТОЛЬКО поверх наших меток пути', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        const result = detector.detect({
            ID: '42',
            SOURCE_ID: 'CALL',
            UF_CRM_OP_LEAD_SITE_STATUS: 12,
        });
        expect(result.kind).toBe('lead');
        // Решение по чужому полю обязано быть видно в сигналах и логах.
        expect(result.signals.join(' ')).toContain('ЧУЖОМУ полю SOURCE_ID');
    });

    it('метки пути без внятного источника → заявка', () => {
        const detector = new LeadRequestDetectorService(makePortal(true));
        // Кастомный источник портала смыслом не обладает — гадать по нему
        // нельзя, решают наши метки.
        expect(
            detector.detect({
                ID: '42',
                SOURCE_ID: '17',
                UF_CRM_OP_LEAD_SITE_STAGE: 5,
            }).kind,
        ).toBe('request');
    });
});
