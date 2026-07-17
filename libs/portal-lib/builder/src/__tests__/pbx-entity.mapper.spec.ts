import {
    firstOrNull,
    firstSales,
    mapBitrixList,
    mapDeal,
    mapSmart,
} from '../mappers/pbx-entity.mapper';
import {
    aggregateFixture,
    categoryRow,
    dealRow,
    fieldRow,
    listRow,
    portalRow,
    smartRow,
} from './fixtures';

describe('pbx-entity.mapper', () => {
    it('привязывает поля и категории по entity_type + entity_id', () => {
        const ctx = aggregateFixture(
            portalRow(),
            [
                fieldRow({
                    entity_type: 'App\\Models\\BtxDeal',
                    entity_id: 3n,
                }),
                fieldRow({
                    id: 6n,
                    entity_type: 'App\\Models\\BtxDeal',
                    entity_id: 99n,
                }),
            ],
            [categoryRow({ entity_id: 3n })],
        );

        const deal = mapDeal(dealRow({ id: 3n }), ctx);

        expect(deal.bitrixfields).toHaveLength(1);
        expect(deal.bitrixfields[0].id).toBe(5);
        expect(deal.categories).toHaveLength(1);
    });

    it('отдаёт пустые массивы, если полей и категорий для сущности нет', () => {
        const ctx = aggregateFixture(portalRow());

        const deal = mapDeal(dealRow(), ctx);

        expect(deal.bitrixfields).toEqual([]);
        expect(deal.categories).toEqual([]);
    });

    it('читает поля лида и списка по legacy-написаниям FQCN (BtxLead, Bitrixlist)', () => {
        const ctx = aggregateFixture(portalRow(), [
            fieldRow({
                entity_type: 'App\\Models\\Bitrixlist',
                entity_id: 6n,
                parent_type: 'list',
            }),
        ]);

        const list = mapBitrixList(listRow({ id: 6n }), ctx);

        expect(list.bitrixfields).toHaveLength(1);
    });

    it('фильтрует поля списка по parent_type=list (как morphMany в Laravel)', () => {
        const ctx = aggregateFixture(portalRow(), [
            fieldRow({
                entity_type: 'App\\Models\\Bitrixlist',
                entity_id: 6n,
                parent_type: 'list',
            }),
            fieldRow({
                id: 6n,
                entity_type: 'App\\Models\\Bitrixlist',
                entity_id: 6n,
                parent_type: 'logo',
            }),
        ]);

        const list = mapBitrixList(listRow({ id: 6n }), ctx);

        expect(list.bitrixfields).toHaveLength(1);
        expect(list.bitrixfields[0].parent_type).toBe('list');
    });

    it('у смарта bitrixfields и fields — один массив, nullable-числа проходят как null', () => {
        const ctx = aggregateFixture(portalRow(), [
            fieldRow({ entity_type: 'App\\Models\\Smart', entity_id: 4n }),
        ]);

        const smart = mapSmart(smartRow({ forStageId: null }), ctx);

        expect(smart.fields).toBe(smart.bitrixfields);
        expect(smart.bitrixId).toBe(134);
        expect(smart.forStageId).toBeNull();
    });

    it('firstSales выбирает первый элемент группы sales и null без фолбэка', () => {
        expect(
            firstSales([{ group: 'service' }, { group: 'sales', id: 2 }]),
        ).toEqual({ group: 'sales', id: 2 });
        expect(firstSales([{ group: 'service' }])).toBeNull();
        expect(firstSales([])).toBeNull();
    });

    it('firstOrNull отдаёт первый элемент или null', () => {
        expect(firstOrNull([1, 2])).toBe(1);
        expect(firstOrNull([])).toBeNull();
    });
});
