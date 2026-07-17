import {
    EDepartamentGroup,
    EMeasureType,
    IDepartment,
    IPCallingTasksGroup,
    IPMeasure,
    IPPortalMeasure,
    IPresetRQ,
    PMeasureCode,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalWithRelations } from '../repositories/portal-aggregate.types';
import {
    nonNull,
    toIsoOrNull,
    toNumber,
    toNumberOrNull,
} from './laravel-serialize.util';

/** departaments -> IDepartment (Laravel отдавал raw-модель Departament). */
export const mapDepartament = (
    row: PortalWithRelations['departaments'][number],
): IDepartment => ({
    id: toNumber(row.id),
    type: row.type,
    group: row.group as EDepartamentGroup,
    name: row.name,
    title: row.title,
    bitrixId: toNumber(row.bitrixId),
    portal_id: toNumber(row.portal_id),
});

/** callings -> IPCallingTasksGroup (Laravel отдавал raw-модель Calling). */
export const mapCallingGroup = (
    row: PortalWithRelations['callings'][number],
): IPCallingTasksGroup => ({
    id: toNumber(row.id),
    type: row.type as IPCallingTasksGroup['type'],
    group: row.group as IPCallingTasksGroup['group'],
    name: row.name,
    title: row.title,
    bitrixId: toNumber(row.bitrixId),
    portal_id: toNumber(row.portal_id),
});

/** bx_rqs -> IPresetRQ (числовые поля приводим к number, как объявлено в типах). */
export const mapPresetRq = (
    row: PortalWithRelations['bxRqs'][number],
): IPresetRQ => ({
    id: toNumber(row.id),
    portal_id: nonNull(toNumberOrNull(row.portal_id)),
    name: nonNull(row.name),
    code: nonNull(row.code),
    type: nonNull(row.type),
    bitrix_id: nonNull(toNumberOrNull(row.bitrix_id)),
    xml_id: nonNull(row.xml_id),
    entity_type_id: nonNull(toNumberOrNull(row.entity_type_id)),
    country_id: nonNull(row.country_id),
    is_active: row.is_active,
    sort: nonNull(row.sort),
});

/** portal_measure (+measures) -> IPPortalMeasure. */
export const mapPortalMeasure = (
    row: PortalWithRelations['portal_measure'][number],
): IPPortalMeasure => ({
    id: toNumber(row.id),
    measure_id: toNumber(row.measure_id),
    portal_id: toNumber(row.portal_id),
    bitrixId: nonNull(row.bitrixId),
    name: nonNull(row.name),
    shortName: nonNull(row.shortName),
    fullName: nonNull(row.fullName),
    created_at: nonNull(toIsoOrNull(row.created_at)),
    updated_at: nonNull(toIsoOrNull(row.updated_at)),
    measure: mapMeasure(row.measures),
});

const mapMeasure = (
    row: PortalWithRelations['portal_measure'][number]['measures'],
): IPMeasure => ({
    id: toNumber(row.id),
    created_at: nonNull(toIsoOrNull(row.created_at)),
    updated_at: nonNull(toIsoOrNull(row.updated_at)),
    name: row.name,
    shortName: row.shortName,
    fullName: row.fullName,
    code: row.code as PMeasureCode,
    type: nonNull(row.type) as EMeasureType,
});
