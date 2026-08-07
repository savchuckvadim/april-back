import { PortalModel } from '../services/portal.model';

const leadCategories = [
    {
        id: 41,
        group: 'sales',
        code: 'lead_sales',
        stages: [
            { id: 1, code: 'lead_new', bitrixId: 'NEW' },
            { id: 2, code: 'lead_company_work', bitrixId: 'PBX_COMPANY_WORK' },
            { id: 3, code: 'lead_pres', bitrixId: 'UC_ABC12' },
        ],
    },
];

const makeModel = (lead?: unknown) =>
    new PortalModel(
        { domain: 'example.bitrix24.ru', deals: [], lead } as never,
        null as never,
    );

describe('PortalModel — стадии лида', () => {
    it('резолвит STATUS_ID по pbx-коду (плоский, без C{n}:)', () => {
        const model = makeModel({ categories: leadCategories });
        expect(model.getLeadStatusIdByCode('lead_company_work')).toBe(
            'PBX_COMPANY_WORK',
        );
        // зеркальная стадия, сопоставленная с клиентским статусом
        expect(model.getLeadStatusIdByCode('lead_pres')).toBe('UC_ABC12');
    });

    it('обратный резолв: pbx-код по STATUS_ID', () => {
        const model = makeModel({ categories: leadCategories });
        expect(model.getLeadStageCodeByStatusId('PBX_COMPANY_WORK')).toBe(
            'lead_company_work',
        );
        expect(model.getLeadStageCodeByStatusId('UNKNOWN')).toBeUndefined();
        expect(model.getLeadStageCodeByStatusId('')).toBeUndefined();
    });

    it('категория лида находится по группе', () => {
        const model = makeModel({ categories: leadCategories });
        expect(model.getLeadCategoryByGroup('sales')?.id).toBe(41);
        expect(model.getLeadCategoryByGroup('service')).toBeUndefined();
    });

    it('портал без секции lead не роняет резолверы', () => {
        const model = makeModel(undefined);
        expect(model.getLeadCategories()).toEqual([]);
        expect(model.getLeadStageByCode('lead_new')).toBeUndefined();
        expect(model.getLeadStatusIdByCode('lead_new')).toBeUndefined();
        expect(model.getLeadStageCodeByStatusId('NEW')).toBeUndefined();
    });
});
