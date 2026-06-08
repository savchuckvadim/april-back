import type { btx_companies } from 'generated/prisma';
import { bigintConvertToNumber } from '@/shared';
import { PortalCompanyEntity } from '../entity/portal-company.entity';
import type { CreatePortalCompanyDto } from '../dto/create-portal-company.dto';
import type { UpdatePortalCompanyDto } from '../dto/update-portal-company.dto';
import { PortalCompanyResponseDto } from '../dto/portal-company-response.dto';
import type { PortalCompanyWithFieldsEntity } from '../entity/portal-company-with-fields.entity';
import { PortalCompanyWithFieldsResponseDto } from '../dto/portal-company-with-fields-response.dto';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain/field/dto/pbx-field.enity.dto';

export function portalCompanyEntityFromPrisma(
    row: btx_companies,
): PortalCompanyEntity {
    const e = new PortalCompanyEntity();
    e.id = bigintConvertToNumber(row.id);
    e.portalId = bigintConvertToNumber(row.portal_id);
    e.name = row.name;
    e.title = row.title;
    e.code = row.code;
    e.createdAt = row.created_at ?? null;
    e.updatedAt = row.updated_at ?? null;
    return e;
}

export function portalCompanyPrismaCreateFromDto(
    dto: CreatePortalCompanyDto,
): Pick<btx_companies, 'name' | 'title' | 'code' | 'portal_id'> {
    return {
        name: dto.name,
        title: dto.title,
        code: dto.code,
        portal_id: BigInt(dto.portalId),
    };
}

export function portalCompanyPrismaUpdatePatch(
    dto: UpdatePortalCompanyDto,
): Partial<Pick<btx_companies, 'name' | 'title' | 'code' | 'portal_id'>> {
    const patch: Partial<
        Pick<btx_companies, 'name' | 'title' | 'code' | 'portal_id'>
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

export function portalCompanyEntityToResponseDto(
    entity: PortalCompanyEntity,
): PortalCompanyResponseDto {
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

export function portalCompanyWithFieldsToResponseDto(
    row: PortalCompanyWithFieldsEntity,
): PortalCompanyWithFieldsResponseDto {
    return {
        company: portalCompanyEntityToResponseDto(row.company),
        fields: row.fields.map(f => new PbxFieldEntityDto(f)),
    };
}
