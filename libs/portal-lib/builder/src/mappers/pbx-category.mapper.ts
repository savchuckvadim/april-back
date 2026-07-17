import {
    IPCategory,
    IStage,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { CategoryWithStages } from '../repositories/portal-aggregate.types';
import { nonNull, toIsoOrNull, toNumber } from './laravel-serialize.util';

/** btx_stages -> IStage (isActive у Laravel — tinyint 0/1). */
export const mapStage = (
    row: CategoryWithStages['btx_stages'][number],
): IStage => ({
    id: toNumber(row.id),
    created_at: nonNull(toIsoOrNull(row.created_at)),
    updated_at: nonNull(toIsoOrNull(row.updated_at)),
    btx_category_id: toNumber(row.btx_category_id),
    name: row.name,
    title: row.title,
    code: row.code,
    bitrixId: row.bitrixId,
    color: row.color,
    isActive: row.isActive ? 1 : 0,
});

/** btx_categories (+stages) -> IPCategory в форме Laravel BtxCategoryResource. */
export const mapCategory = (row: CategoryWithStages): IPCategory => ({
    id: toNumber(row.id),
    type: row.type,
    group: row.group,
    name: row.name,
    title: row.title,
    bitrixId: row.bitrixId,
    bitrixCamelId: row.bitrixCamelId,
    code: row.code,
    isActive: row.isActive ? 1 : 0,
    entity_id: toNumber(row.entity_id),
    entity_type: row.entity_type,
    parent_type: row.parent_type,
    stages: row.btx_stages.map(mapStage),
});
