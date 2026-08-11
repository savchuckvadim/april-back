import {
    findPbxSalesEventField,
    PBX_SALES_EVENT_FIELDS,
} from '../pbx-sales-event-field.type';

/**
 * Зеркало новых полей графа «лид ↔ сделка» и пакета op_lead_* (2026-08):
 * константа обязана совпадать с листом calling_fields Excel-шаблона.
 */
describe('PBX_SALES_EVENT_FIELDS — граф лид↔сделка и op_lead_*', () => {
    it('коды полей уникальны во всём справочнике', () => {
        const codes = PBX_SALES_EVENT_FIELDS.map(field => field.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('рёбра графа: deal_from_lead_id / deal_joined_leads / to_sale_deal', () => {
        const fromLead = findPbxSalesEventField('deal_from_lead_id');
        expect(fromLead?.type).toBe('crm');
        expect(fromLead?.deal).toBe('DEAL_FROM_LEAD_ID');
        expect(fromLead?.isMultiple).toBe(false);

        const joined = findPbxSalesEventField('deal_joined_leads');
        expect(joined?.type).toBe('crm');
        expect(joined?.deal).toBe('DEAL_JOINED_LEADS');
        expect(joined?.isMultiple).toBe(true);

        const toSale = findPbxSalesEventField('to_sale_deal');
        expect(toSale?.type).toBe('crm');
        expect(toSale?.lead).toBe('TO_SALE_DEAL');
    });

    it('enumeration-поля op_lead_* несут непустые items с уникальными кодами', () => {
        const enumCodes = [
            'op_lead_status',
            'op_lead_site_status',
            'op_lead_site_stage',
            'op_leads_related_base_stage',
            'op_lead_not_ca_type',
        ] as const;
        for (const code of enumCodes) {
            const field = findPbxSalesEventField(code);
            expect(field?.type).toBe('enumeration');
            const items: readonly { code: string; name: string }[] =
                field?.items ?? [];
            expect(items.length).toBeGreaterThan(0);
            expect(new Set(items.map(item => item.code)).size).toBe(
                items.length,
            );
        }
    });

    it('ТПС-словарь Гаранта: 8 семантических статусов по официальному документу', () => {
        const tps = findPbxSalesEventField('op_lead_tps_status');
        expect(tps?.type).toBe('enumeration');
        expect(tps?.lead).toBe('OP_LEAD_TPS_STATUS');
        const items: readonly { code: string; name: string }[] =
            tps?.items ?? [];
        expect(items.map(item => item.code)).toEqual([
            'tps_alien_client',
            'tps_alien_territory',
            'tps_served_client',
            'tps_sale',
            'tps_refuse',
            'tps_no_answer',
            'tps_in_work',
            'tps_reserve',
        ]);
    });

    it('ТПС-анкета: два вопроса с вариантами Да/Нет/Нет информации', () => {
        for (const code of [
            'op_lead_tps_quest_need',
            'op_lead_tps_quest_valid',
        ] as const) {
            const field = findPbxSalesEventField(code);
            expect(field?.type).toBe('enumeration');
            expect(field?.lead).toBeTruthy();
            const items: readonly { code: string; name: string }[] =
                field?.items ?? [];
            expect(items.map(item => item.name)).toEqual([
                'Да',
                'Нет',
                'Нет информации',
            ]);
        }
    });

    it('булевы маркеры процессов установлены на лид', () => {
        for (const code of [
            'op_lead_is_duplicate_check',
            'op_lead_is_duplicate',
            'op_lead_is_merged_by_exist',
            'op_lead_is_boost_sale',
            'op_lead_is_company',
        ] as const) {
            const field = findPbxSalesEventField(code);
            expect(field?.type).toBe('boolean');
            expect(field?.lead).toBeTruthy();
        }
    });
});
