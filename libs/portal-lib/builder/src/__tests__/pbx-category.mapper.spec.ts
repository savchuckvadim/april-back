import { mapCategory, mapStage } from '../mappers/pbx-category.mapper';
import { categoryRow, stageRow } from './fixtures';

describe('pbx-category.mapper', () => {
    it('маппит стадию: isActive приводится к 0/1, даты — к ISO-строкам', () => {
        const stage = mapStage(stageRow());

        expect(stage).toMatchObject({
            id: 7,
            btx_category_id: 2,
            name: 'cold_new',
            bitrixId: 'NEW',
            color: '#39A8EF',
            isActive: 1,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: null,
        });
    });

    it('маппит неактивную стадию в isActive=0', () => {
        expect(mapStage(stageRow({ isActive: false })).isActive).toBe(0);
    });

    it('маппит категорию со стадиями и полиморфными атрибутами', () => {
        const category = mapCategory(categoryRow());

        expect(category).toMatchObject({
            id: 2,
            type: 'base',
            group: 'sales',
            code: 'sales_base',
            isActive: 1,
            entity_id: 3,
            entity_type: 'App\\Models\\BtxDeal',
            parent_type: 'deal',
        });
        expect(category.stages).toHaveLength(1);
        expect(category.stages[0].code).toBe('cold_new');
    });
});
