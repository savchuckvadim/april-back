import type { callings } from 'generated/prisma';
import { bigintConvertToNumber } from '@/shared';
import {
    CALLING_TYPE,
    ECallingGroup,
    PortalCallingEntity,
} from '../entity/portal-calling.entity';
import type { CreatePortalCallingDto } from '../dto/create-portal-calling.dto';
import type { UpdatePortalCallingDto } from '../dto/update-portal-calling.dto';
import { PortalCallingResponseDto } from '../dto/portal-calling-response.dto';

/** Поля строки `callings`, которыми управляет домен. */
export type PortalCallingWritable = Pick<
    callings,
    'type' | 'group' | 'name' | 'title' | 'bitrixId' | 'portal_id'
>;

export function portalCallingEntityFromPrisma(
    row: callings,
): PortalCallingEntity {
    const e = new PortalCallingEntity();
    e.id = bigintConvertToNumber(row.id);
    e.portalId = bigintConvertToNumber(row.portal_id);
    e.type = CALLING_TYPE;
    e.group = row.group as ECallingGroup;
    e.name = row.name;
    e.title = row.title;
    e.bitrixId = bigintConvertToNumber(row.bitrixId);
    return e;
}

export function portalCallingPrismaCreateFromDto(
    dto: CreatePortalCallingDto,
): PortalCallingWritable {
    return {
        type: CALLING_TYPE,
        group: dto.group,
        name: dto.name,
        title: dto.title,
        bitrixId: BigInt(dto.bitrixId),
        portal_id: BigInt(dto.portalId),
    };
}

export function portalCallingPrismaUpdatePatch(
    dto: UpdatePortalCallingDto,
): Partial<PortalCallingWritable> {
    const patch: Partial<PortalCallingWritable> = {};
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

export function portalCallingEntityToResponseDto(
    entity: PortalCallingEntity,
): PortalCallingResponseDto {
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
