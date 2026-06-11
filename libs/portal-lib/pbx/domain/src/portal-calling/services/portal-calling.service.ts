import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalCallingRepository } from '../repositories/portal-calling.repository';
import { CreatePortalCallingDto } from '../dto/create-portal-calling.dto';
import { UpdatePortalCallingDto } from '../dto/update-portal-calling.dto';
import { PortalCallingResponseDto } from '../dto/portal-calling-response.dto';
import { CALLING_TYPE, ECallingGroup } from '../entity/portal-calling.entity';
import {
    portalCallingEntityFromPrisma,
    portalCallingEntityToResponseDto,
    portalCallingPrismaCreateFromDto,
    portalCallingPrismaUpdatePatch,
} from '../utils/portal-calling-entity.util';

/**
 * Доступ к группам звонков портала (таблица `callings`).
 * Источник истины — Bitrix; здесь зеркало для конструктора/фронта.
 */
@Injectable()
export class PortalCallingService {
    constructor(private readonly repository: PortalCallingRepository) {}

    async create(
        dto: CreatePortalCallingDto,
    ): Promise<PortalCallingResponseDto> {
        const row = await this.repository.create(
            portalCallingPrismaCreateFromDto(dto),
        );
        return portalCallingEntityToResponseDto(
            portalCallingEntityFromPrisma(row),
        );
    }

    async findById(id: number): Promise<PortalCallingResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Calling group id=${id} not found`);
        }
        return portalCallingEntityToResponseDto(
            portalCallingEntityFromPrisma(row),
        );
    }

    async findByPortalId(
        portalId: number,
    ): Promise<PortalCallingResponseDto[]> {
        const rows = await this.repository.findByPortalId(portalId);
        return rows.map(r =>
            portalCallingEntityToResponseDto(portalCallingEntityFromPrisma(r)),
        );
    }

    async findMany(): Promise<PortalCallingResponseDto[]> {
        const rows = await this.repository.findMany();
        return rows.map(r =>
            portalCallingEntityToResponseDto(portalCallingEntityFromPrisma(r)),
        );
    }

    /**
     * Upsert по уникальному ключу type + group + portalId.
     * Если группа звонков уже есть — обновляет name/title/bitrixId, иначе создаёт.
     */
    async upsertByKey(
        portalId: number,
        group: ECallingGroup,
        data: { name: string; title: string; bitrixId: number },
    ): Promise<PortalCallingResponseDto> {
        const existing = await this.repository.findByTypeGroupPortal(
            CALLING_TYPE,
            group,
            portalId,
        );
        if (existing) {
            const patch = portalCallingPrismaUpdatePatch(
                data as UpdatePortalCallingDto,
            );
            const row = await this.repository.update(
                Number(existing.id),
                patch,
            );
            return portalCallingEntityToResponseDto(
                portalCallingEntityFromPrisma(row),
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

    /**
     * Привязать `bitrixId` к группе звонков по ключу type + group + portalId (upsert).
     *
     * Ключ уникален, поэтому на портале не может быть двух строк одной группы:
     * - строка есть → обновляем только `bitrixId` (имя/заголовок не трогаем);
     * - строки нет → создаём её с `defaults.name`/`defaults.title` и переданным `bitrixId`.
     */
    async setBitrixIdByKey(
        portalId: number,
        group: ECallingGroup,
        bitrixId: number,
        defaults: { name: string; title: string },
    ): Promise<PortalCallingResponseDto> {
        const existing = await this.repository.findByTypeGroupPortal(
            CALLING_TYPE,
            group,
            portalId,
        );
        if (existing) {
            const row = await this.repository.update(
                Number(existing.id),
                portalCallingPrismaUpdatePatch({
                    bitrixId,
                } as UpdatePortalCallingDto),
            );
            return portalCallingEntityToResponseDto(
                portalCallingEntityFromPrisma(row),
            );
        }
        return this.create({
            portalId,
            group,
            name: defaults.name,
            title: defaults.title,
            bitrixId,
        });
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.repository.delete(id);
    }
}
