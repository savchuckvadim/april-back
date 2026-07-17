import {
    IField,
    IFieldItem,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { BitrixFieldWithItems } from '../repositories/portal-aggregate.types';
import { nonNull, toNumber } from './laravel-serialize.util';

/**
 * Поле в форме Laravel BitrixFieldResource: интерфейс IField плюс `id`,
 * который Laravel всегда отдавал (в IField исторически описан только ID?).
 * Опциональные в IField поля здесь обязательны — Laravel отдавал их всегда.
 */
export type FieldModel = IField & {
    id: number;
    entity_id: number;
    parent_type: string;
    bitrixfielditems: IFieldItem[];
};

/** bitrixfield_items -> IFieldItem (как отдавал Laravel raw-моделью). */
export const mapFieldItem = (
    row: BitrixFieldWithItems['bitrixfield_items'][number],
): IFieldItem => ({
    id: toNumber(row.id),
    created_at: nonNull(row.created_at),
    updated_at: nonNull(row.updated_at),
    bitrixfield_id: toNumber(row.bitrixfield_id),
    name: row.name,
    title: row.title,
    code: row.code,
    bitrixId: row.bitrixId,
});

/**
 * bitrixfields (+items) -> поле в форме Laravel BitrixFieldResource.
 * `bitrixfielditems` и `items` — один и тот же массив (так делал Laravel).
 */
export const mapField = (row: BitrixFieldWithItems): FieldModel => {
    const items = row.bitrixfield_items.map(mapFieldItem);
    return {
        id: toNumber(row.id),
        type: row.type,
        code: row.code,
        name: row.name,
        title: row.title,
        bitrixId: row.bitrixId,
        bitrixCamelId: row.bitrixCamelId,
        entity_id: toNumber(row.entity_id),
        parent_type: row.parent_type,
        bitrixfielditems: items,
        items,
    };
};
