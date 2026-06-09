import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalDepartamentRepository } from '../repositories/portal-departament.repository';
import { CreatePortalDepartamentDto } from '../dto/create-portal-departament.dto';
import { UpdatePortalDepartamentDto } from '../dto/update-portal-departament.dto';
import { PortalDepartamentResponseDto } from '../dto/portal-departament-response.dto';
import {
    DEPARTAMENT_TYPE,
    EDepartamentGroup,
} from '../entity/portal-departament.entity';
import {
    portalDepartamentEntityFromPrisma,
    portalDepartamentEntityToResponseDto,
    portalDepartamentPrismaCreateFromDto,
    portalDepartamentPrismaUpdatePatch,
} from '../utils/portal-departament-entity.util';

/**
 * Доступ к отделам портала (таблица `departaments`).
 * В Bitrix ничего не пишется: `bitrixId` — id уже существующего отдела.
 * CRUD только по PortalDB.
 */
@Injectable()
export class PortalDepartamentService {
    constructor(private readonly repository: PortalDepartamentRepository) {}

    async create(
        dto: CreatePortalDepartamentDto,
    ): Promise<PortalDepartamentResponseDto> {
        const row = await this.repository.create(
            portalDepartamentPrismaCreateFromDto(dto),
        );
        return portalDepartamentEntityToResponseDto(
            portalDepartamentEntityFromPrisma(row),
        );
    }

    async findById(id: number): Promise<PortalDepartamentResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Departament id=${id} not found`);
        }
        return portalDepartamentEntityToResponseDto(
            portalDepartamentEntityFromPrisma(row),
        );
    }

    async findByPortalId(
        portalId: number,
    ): Promise<PortalDepartamentResponseDto[]> {
        const rows = await this.repository.findByPortalId(portalId);
        return rows.map(r =>
            portalDepartamentEntityToResponseDto(
                portalDepartamentEntityFromPrisma(r),
            ),
        );
    }

    async findMany(): Promise<PortalDepartamentResponseDto[]> {
        const rows = await this.repository.findMany();
        return rows.map(r =>
            portalDepartamentEntityToResponseDto(
                portalDepartamentEntityFromPrisma(r),
            ),
        );
    }

    /**
     * Upsert по уникальному ключу type + group + portalId.
     * Если отдел уже есть — обновляет name/title/bitrixId, иначе создаёт.
     */
    async upsertByKey(
        portalId: number,
        group: EDepartamentGroup,
        data: { name: string; title: string; bitrixId: number },
    ): Promise<PortalDepartamentResponseDto> {
        const existing = await this.repository.findByTypeGroupPortal(
            DEPARTAMENT_TYPE,
            group,
            portalId,
        );
        if (existing) {
            const patch = portalDepartamentPrismaUpdatePatch(
                data as UpdatePortalDepartamentDto,
            );
            const row = await this.repository.update(
                Number(existing.id),
                patch,
            );
            return portalDepartamentEntityToResponseDto(
                portalDepartamentEntityFromPrisma(row),
            );
        }
        return this.create({
            portalId,
            group,
            name: data.name,
            title: data.title,
            bitrixId: data.bitrixId,
        });
    }

    async update(
        id: number,
        dto: UpdatePortalDepartamentDto,
    ): Promise<PortalDepartamentResponseDto> {
        await this.findById(id);
        const row = await this.repository.update(
            id,
            portalDepartamentPrismaUpdatePatch(dto),
        );
        return portalDepartamentEntityToResponseDto(
            portalDepartamentEntityFromPrisma(row),
        );
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.repository.delete(id);
    }
}
