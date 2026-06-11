import type { btx_leads } from 'generated/prisma';
import { bigintConvertToNumber } from '@/shared';
import { PortalLeadEntity } from '../entity/portal-lead.entity';
import type { CreatePortalLeadDto } from '../dto/create-portal-lead.dto';
import type { UpdatePortalLeadDto } from '../dto/update-portal-lead.dto';
import { PortalLeadResponseDto } from '../dto/portal-lead-response.dto';
import type { PortalLeadWithFieldsEntity } from '../entity/portal-lead-with-fields.entity';
import { PortalLeadWithFieldsResponseDto } from '../dto/portal-lead-with-fields-response.dto';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain/field/dto/pbx-field.enity.dto';

export function portalLeadEntityFromPrisma(row: btx_leads): PortalLeadEntity {
    const e = new PortalLeadEntity();
    e.id = bigintConvertToNumber(row.id);
    e.portalId = bigintConvertToNumber(row.portal_id);
    e.name = row.name;
    e.title = row.title;
    e.code = row.code;
    e.createdAt = row.created_at ?? null;
    e.updatedAt = row.updated_at ?? null;
    return e;
}

export function portalLeadPrismaCreateFromDto(
    dto: CreatePortalLeadDto,
): Pick<btx_leads, 'name' | 'title' | 'code' | 'portal_id'> {
    return {
        name: dto.name,
        title: dto.title,
        code: dto.code,
        portal_id: BigInt(dto.portalId),
    };
}

export function portalLeadPrismaUpdatePatch(
    dto: UpdatePortalLeadDto,
): Partial<Pick<btx_leads, 'name' | 'title' | 'code' | 'portal_id'>> {
    const patch: Partial<
        Pick<btx_leads, 'name' | 'title' | 'code' | 'portal_id'>
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

export function portalLeadEntityToResponseDto(
    entity: PortalLeadEntity,
): PortalLeadResponseDto {
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

export function portalLeadWithFieldsToResponseDto(
    row: PortalLeadWithFieldsEntity,
): PortalLeadWithFieldsResponseDto {
    return {
        lead: portalLeadEntityToResponseDto(row.lead),
        fields: row.fields.map(f => new PbxFieldEntityDto(f)),
    };
}
