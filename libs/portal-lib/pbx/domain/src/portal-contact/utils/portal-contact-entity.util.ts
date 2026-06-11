import type { btx_contacts } from 'generated/prisma';
import { bigintConvertToNumber } from '@/shared';
import { PortalContactEntity } from '../entity/portal-contact.entity';
import type { CreatePortalContactDto } from '../dto/create-portal-contact.dto';
import type { UpdatePortalContactDto } from '../dto/update-portal-contact.dto';
import { PortalContactResponseDto } from '../dto/portal-contact-response.dto';
import type { PortalContactWithFieldsEntity } from '../entity/portal-contact-with-fields.entity';
import { PortalContactWithFieldsResponseDto } from '../dto/portal-contact-with-fields-response.dto';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain/field/dto/pbx-field.enity.dto';

export function portalContactEntityFromPrisma(
    row: btx_contacts,
): PortalContactEntity {
    const e = new PortalContactEntity();
    e.id = bigintConvertToNumber(row.id);
    e.portalId = bigintConvertToNumber(row.portal_id);
    e.name = row.name;
    e.title = row.title;
    e.code = row.code;
    e.createdAt = row.created_at ?? null;
    e.updatedAt = row.updated_at ?? null;
    return e;
}

export function portalContactPrismaCreateFromDto(
    dto: CreatePortalContactDto,
): Pick<btx_contacts, 'name' | 'title' | 'code' | 'portal_id'> {
    return {
        name: dto.name,
        title: dto.title,
        code: dto.code,
        portal_id: BigInt(dto.portalId),
    };
}

export function portalContactPrismaUpdatePatch(
    dto: UpdatePortalContactDto,
): Partial<Pick<btx_contacts, 'name' | 'title' | 'code' | 'portal_id'>> {
    const patch: Partial<
        Pick<btx_contacts, 'name' | 'title' | 'code' | 'portal_id'>
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

export function portalContactEntityToResponseDto(
    entity: PortalContactEntity,
): PortalContactResponseDto {
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

export function portalContactWithFieldsToResponseDto(
    row: PortalContactWithFieldsEntity,
): PortalContactWithFieldsResponseDto {
    return {
        contact: portalContactEntityToResponseDto(row.contact),
        fields: row.fields.map(f => new PbxFieldEntityDto(f)),
    };
}
