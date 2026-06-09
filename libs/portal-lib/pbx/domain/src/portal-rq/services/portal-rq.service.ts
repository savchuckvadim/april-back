import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalRqRepository } from '../repositories/portal-rq.repository';
import { CreatePortalRqDto } from '../dto/create-portal-rq.dto';
import { UpdatePortalRqDto } from '../dto/update-portal-rq.dto';
import { PortalRqResponseDto } from '../dto/portal-rq-response.dto';
import {
    portalRqEntityFromPrisma,
    portalRqEntityToResponseDto,
    portalRqPrismaCreateFromDto,
    portalRqPrismaUpdatePatch,
} from '../utils/portal-rq-entity.util';

/**
 * Доступ к пресетам реквизитов портала (таблица `bx_rqs`).
 * Источник истины — Bitrix (`crm.requisite.preset.*`); здесь зеркало для
 * конструктора/фронта и для рантайма `apps/rq`.
 */
@Injectable()
export class PortalRqService {
    constructor(private readonly repository: PortalRqRepository) {}

    async create(dto: CreatePortalRqDto): Promise<PortalRqResponseDto> {
        const row = await this.repository.create(
            portalRqPrismaCreateFromDto(dto),
        );
        return portalRqEntityToResponseDto(portalRqEntityFromPrisma(row));
    }

    async findById(id: number): Promise<PortalRqResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`RQ preset id=${id} not found`);
        }
        return portalRqEntityToResponseDto(portalRqEntityFromPrisma(row));
    }

    async findByPortalId(portalId: number): Promise<PortalRqResponseDto[]> {
        const rows = await this.repository.findByPortalId(portalId);
        return rows.map(r =>
            portalRqEntityToResponseDto(portalRqEntityFromPrisma(r)),
        );
    }

    async findMany(): Promise<PortalRqResponseDto[]> {
        const rows = await this.repository.findMany();
        return rows.map(r =>
            portalRqEntityToResponseDto(portalRqEntityFromPrisma(r)),
        );
    }

    async update(
        id: number,
        dto: UpdatePortalRqDto,
    ): Promise<PortalRqResponseDto> {
        await this.findById(id);
        const row = await this.repository.update(
            id,
            portalRqPrismaUpdatePatch(dto),
        );
        return portalRqEntityToResponseDto(portalRqEntityFromPrisma(row));
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.repository.delete(id);
    }

    /**
     * Upsert по уникальному ключу code + portalId.
     * Если пресет уже есть — обновляет переданные поля, иначе создаёт.
     * Основной метод зеркалирования из pbx-install.
     */
    async upsertByCodePortal(
        portalId: number,
        code: string,
        data: Omit<CreatePortalRqDto, 'portalId' | 'code'>,
    ): Promise<PortalRqResponseDto> {
        const existing = await this.repository.findByCodePortal(code, portalId);
        if (existing) {
            const row = await this.repository.update(
                Number(existing.id),
                portalRqPrismaUpdatePatch(data),
            );
            return portalRqEntityToResponseDto(portalRqEntityFromPrisma(row));
        }
        return this.create({ portalId, code, ...data });
    }
}
