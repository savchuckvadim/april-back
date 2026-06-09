import type { bx_rqs } from 'generated/prisma';
import { bigintConvertToNumber } from '@/shared';
import { PortalRqEntity } from '../entity/portal-rq.entity';
import type { CreatePortalRqDto } from '../dto/create-portal-rq.dto';
import type { UpdatePortalRqDto } from '../dto/update-portal-rq.dto';
import { PortalRqResponseDto } from '../dto/portal-rq-response.dto';

/** Поля строки `bx_rqs`, которыми управляет домен. */
export type PortalRqWritable = Pick<
    bx_rqs,
    | 'portal_id'
    | 'name'
    | 'code'
    | 'type'
    | 'bitrix_id'
    | 'xml_id'
    | 'entity_type_id'
    | 'country_id'
    | 'is_active'
    | 'sort'
>;

/** Строковое значение из БД → число | null. */
function toNumberOrNull(value: string | null): number | null {
    if (value === null || value.trim() === '') {
        return null;
    }
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
}

/** Число/строка → строковое представление для БД | null. */
function toDbString(value: number | string | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    return String(value);
}

export function portalRqEntityFromPrisma(row: bx_rqs): PortalRqEntity {
    const e = new PortalRqEntity();
    e.id = bigintConvertToNumber(row.id);
    e.portalId = row.portal_id ? bigintConvertToNumber(row.portal_id) : 0;
    e.name = row.name;
    e.code = row.code;
    e.type = row.type;
    e.bitrixId = toNumberOrNull(row.bitrix_id);
    e.xmlId = row.xml_id;
    e.entityTypeId = toNumberOrNull(row.entity_type_id);
    e.countryId = row.country_id;
    e.isActive = row.is_active;
    e.sort = row.sort;
    return e;
}

export function portalRqPrismaCreateFromDto(
    dto: CreatePortalRqDto,
): PortalRqWritable {
    return {
        portal_id: BigInt(dto.portalId),
        code: dto.code,
        name: dto.name ?? null,
        type: dto.type ?? null,
        bitrix_id: toDbString(dto.bitrixId),
        xml_id: dto.xmlId ?? null,
        entity_type_id: toDbString(dto.entityTypeId),
        country_id: dto.countryId ?? null,
        is_active: dto.isActive ?? true,
        sort: dto.sort ?? null,
    };
}

export function portalRqPrismaUpdatePatch(
    dto: UpdatePortalRqDto,
): Partial<PortalRqWritable> {
    const patch: Partial<PortalRqWritable> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.bitrixId !== undefined) patch.bitrix_id = toDbString(dto.bitrixId);
    if (dto.xmlId !== undefined) patch.xml_id = dto.xmlId;
    if (dto.entityTypeId !== undefined)
        patch.entity_type_id = toDbString(dto.entityTypeId);
    if (dto.countryId !== undefined) patch.country_id = dto.countryId;
    if (dto.isActive !== undefined) patch.is_active = dto.isActive;
    if (dto.sort !== undefined) patch.sort = dto.sort;
    return patch;
}

export function portalRqEntityToResponseDto(
    entity: PortalRqEntity,
): PortalRqResponseDto {
    return {
        id: entity.id,
        portalId: entity.portalId,
        code: entity.code,
        name: entity.name,
        type: entity.type,
        bitrixId: entity.bitrixId,
        xmlId: entity.xmlId,
        entityTypeId: entity.entityTypeId,
        countryId: entity.countryId,
        isActive: entity.isActive,
        sort: entity.sort,
    };
}
