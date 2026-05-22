import type { btx_deals } from 'generated/prisma';
import { bigintConvertToNumber } from '@/shared';
import { PortalDealEntity } from '../entity/portal-deal.entity';
import type { CreatePortalDealDto } from '../dto/create-portal-deal.dto';
import type { UpdatePortalDealDto } from '../dto/update-portal-deal.dto';
import { PortalDealResponseDto } from '../dto/portal-deal-response.dto';
import type { PortalDealWithFieldsEntity } from '../entity/portal-deal-with-fields.entity';
import { PortalDealWithFieldsResponseDto } from '../dto/portal-deal-with-fields-response.dto';
import { PbxFieldEntityDto } from '@/modules/pbx-domain/field/dto/pbx-field.enity.dto';

export function portalDealEntityFromPrisma(
    row: btx_deals,
): PortalDealEntity {
    const e = new PortalDealEntity();
    e.id = bigintConvertToNumber(row.id);
    e.portalId = bigintConvertToNumber(row.portal_id);
    e.name = row.name;
    e.title = row.title;
    e.code = row.code;
    e.createdAt = row.created_at ?? null;
    e.updatedAt = row.updated_at ?? null;
    return e;
}

export function portalDealPrismaCreateFromDto(
    dto: CreatePortalDealDto,
): Pick<btx_deals, 'name' | 'title' | 'code' | 'portal_id'> {
    return {
        name: dto.name,
        title: dto.title,
        code: dto.code,
        portal_id: BigInt(dto.portalId),
    };
}

export function portalDealPrismaUpdatePatch(
    dto: UpdatePortalDealDto,
): Partial<Pick<btx_deals, 'name' | 'title' | 'code' | 'portal_id'>> {
    const patch: Partial<
        Pick<btx_deals, 'name' | 'title' | 'code' | 'portal_id'>
    > = {};
    if (dto.name !== undefined) {
        patch.name = dto.name;
    }
    if (dto.title !== undefined) {
        patch.title = dto.title;
    }
    if (dto.code !== undefined) {
        patch.code = dto.code;
    }
    if (dto.portalId !== undefined) {
        patch.portal_id = BigInt(dto.portalId);
    }
    return patch;
}

export function portalDealEntityToResponseDto(
    entity: PortalDealEntity,
): PortalDealResponseDto {
    return {
        id: entity.id,
        portalId: entity.portalId,
        name: entity.name,
        title: entity.title,
        code: entity.code,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
}

export function portalDealWithFieldsToResponseDto(
    row: PortalDealWithFieldsEntity,
): PortalDealWithFieldsResponseDto {
    return {
        deal: portalDealEntityToResponseDto(row.deal),
        fields: row.fields.map(f => new PbxFieldEntityDto(f)),
    };
}
