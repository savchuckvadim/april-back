import type { departaments } from 'generated/prisma';
import { bigintConvertToNumber } from '@/shared';
import {
    DEPARTAMENT_TYPE,
    EDepartamentGroup,
    PortalDepartamentEntity,
} from '../entity/portal-departament.entity';
import type { CreatePortalDepartamentDto } from '../dto/create-portal-departament.dto';
import type { UpdatePortalDepartamentDto } from '../dto/update-portal-departament.dto';
import { PortalDepartamentResponseDto } from '../dto/portal-departament-response.dto';

/** Поля строки `departaments`, которыми управляет домен. */
export type PortalDepartamentWritable = Pick<
    departaments,
    'type' | 'group' | 'name' | 'title' | 'bitrixId' | 'portal_id'
>;

export function portalDepartamentEntityFromPrisma(
    row: departaments,
): PortalDepartamentEntity {
    const e = new PortalDepartamentEntity();
    e.id = bigintConvertToNumber(row.id);
    e.portalId = bigintConvertToNumber(row.portal_id);
    e.type = DEPARTAMENT_TYPE;
    e.group = row.group as EDepartamentGroup;
    e.name = row.name;
    e.title = row.title;
    e.bitrixId = bigintConvertToNumber(row.bitrixId);
    return e;
}

export function portalDepartamentPrismaCreateFromDto(
    dto: CreatePortalDepartamentDto,
): PortalDepartamentWritable {
    return {
        type: DEPARTAMENT_TYPE,
        group: dto.group,
        name: dto.name,
        title: dto.title,
        bitrixId: BigInt(dto.bitrixId),
        portal_id: BigInt(dto.portalId),
    };
}

export function portalDepartamentPrismaUpdatePatch(
    dto: UpdatePortalDepartamentDto,
): Partial<PortalDepartamentWritable> {
    const patch: Partial<PortalDepartamentWritable> = {};
    if (dto.name !== undefined) {
        patch.name = dto.name;
    }
    if (dto.title !== undefined) {
        patch.title = dto.title;
    }
    if (dto.bitrixId !== undefined) {
        patch.bitrixId = BigInt(dto.bitrixId);
    }
    return patch;
}

export function portalDepartamentEntityToResponseDto(
    entity: PortalDepartamentEntity,
): PortalDepartamentResponseDto {
    return {
        id: entity.id,
        portalId: entity.portalId,
        type: entity.type,
        group: entity.group,
        name: entity.name,
        title: entity.title,
        bitrixId: entity.bitrixId,
    };
}
