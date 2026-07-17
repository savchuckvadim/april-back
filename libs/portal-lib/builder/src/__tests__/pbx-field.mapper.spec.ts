import { mapField, mapFieldItem } from '../mappers/pbx-field.mapper';
import { fieldItemRow, fieldRow } from './fixtures';

describe('pbx-field.mapper', () => {
    it('маппит элемент поля с конвертацией BigInt в number', () => {
        const item = mapFieldItem(fieldItemRow());

        expect(item).toEqual({
            id: 10,
            created_at: new Date('2024-01-01T00:00:00.000Z'),
            updated_at: new Date('2024-01-02T00:00:00.000Z'),
            bitrixfield_id: 5,
            name: 'nok',
            title: 'НОК',
            code: 'nok',
            bitrixId: 128,
        });
    });

    it('маппит поле: bitrixfielditems и items — один и тот же массив (как у Laravel)', () => {
        const field = mapField(fieldRow());

        expect(field.items).toHaveLength(1);
        expect(field.bitrixfielditems).toBe(field.items);
    });

    it('конвертирует BigInt id и entity_id в number', () => {
        const field = mapField(fieldRow({ id: 55n, entity_id: 77n }));

        expect(field.id).toBe(55);
        expect(field.entity_id).toBe(77);
        expect(typeof field.id).toBe('number');
    });

    it('переносит строковые атрибуты поля без изменений', () => {
        const field = mapField(fieldRow());

        expect(field).toMatchObject({
            type: 'enumeration',
            code: 'event_type',
            name: 'event_type',
            title: 'Тип события',
            bitrixId: 'UF_CRM_1',
            bitrixCamelId: 'ufCrm1',
            parent_type: 'deal',
        });
    });
});
