import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import type { btx_leads } from 'generated/prisma';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PortalLeadRepository } from '../repositories/portal-lead.repository';
import { CreatePortalLeadDto } from '../dto/create-portal-lead.dto';
import { UpdatePortalLeadDto } from '../dto/update-portal-lead.dto';
import { PortalLeadResponseDto } from '../dto/portal-lead-response.dto';
import { PortalLeadWithFieldsResponseDto } from '../dto/portal-lead-with-fields-response.dto';
import {
    portalLeadEntityFromPrisma,
    portalLeadEntityToResponseDto,
    portalLeadPrismaCreateFromDto,
    portalLeadPrismaUpdatePatch,
    portalLeadWithFieldsToResponseDto,
} from '../utils/portal-lead-entity.util';
import type { PortalLeadWithFieldsEntity } from '../entity/portal-lead-with-fields.entity';

@Injectable()
export class PortalLeadService {
    constructor(
        private readonly repository: PortalLeadRepository,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async create(dto: CreatePortalLeadDto): Promise<PortalLeadResponseDto> {
        const existing = await this.repository.findFirstByPortalId(
            dto.portalId,
        );
        if (existing) {
            throw new ConflictException(
                `У портала ${dto.portalId} уже есть лид (id=${existing.id.toString()}).`,
            );
        }
        const row = await this.repository.create(
            portalLeadPrismaCreateFromDto(dto),
        );
        return portalLeadEntityToResponseDto(portalLeadEntityFromPrisma(row));
    }

    async findById(id: number): Promise<PortalLeadResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Portal lead id=${id} not found`);
        }
        return portalLeadEntityToResponseDto(portalLeadEntityFromPrisma(row));
    }

    async findByPortalId(
        portalId: number,
    ): Promise<PortalLeadResponseDto | null> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            return null;
        }
        return portalLeadEntityToResponseDto(portalLeadEntityFromPrisma(row));
    }

    async findMany(): Promise<PortalLeadResponseDto[]> {
        const rows = await this.repository.findMany();
        return rows.map(r =>
            portalLeadEntityToResponseDto(portalLeadEntityFromPrisma(r)),
        );
    }

    async findWithFieldsByPortalId(
        portalId: number,
    ): Promise<PortalLeadWithFieldsResponseDto | null> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            return null;
        }
        const agg = await this.buildWithFields(row);
        return portalLeadWithFieldsToResponseDto(agg);
    }

    async findWithFieldsByLeadId(
        id: number,
    ): Promise<PortalLeadWithFieldsResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Portal lead id=${id} not found`);
        }
        const agg = await this.buildWithFields(row);
        return portalLeadWithFieldsToResponseDto(agg);
    }

    async update(
        id: number,
        dto: UpdatePortalLeadDto,
    ): Promise<PortalLeadResponseDto> {
        await this.findById(id);
        if (dto.portalId != null) {
            const other = await this.repository.findFirstByPortalId(
                dto.portalId,
            );
            if (other && other.id !== BigInt(id)) {
                throw new ConflictException(
                    `Портал ${dto.portalId} уже привязан к другому лиду.`,
                );
            }
        }
        const patch = portalLeadPrismaUpdatePatch(dto);
        const row = await this.repository.update(id, patch);
        return portalLeadEntityToResponseDto(portalLeadEntityFromPrisma(row));
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.LEAD,
            BigInt(id),
        );
        await this.repository.delete(id);
    }

    /** Удалить все PBX-поля лида портала (строка `btx_leads` не трогается). */
    async deleteAllFieldsForPortal(portalId: number): Promise<void> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Лид для портала portalId=${portalId} не найден`,
            );
        }
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.LEAD,
            row.id,
        );
    }

    private async buildWithFields(
        row: btx_leads,
    ): Promise<PortalLeadWithFieldsEntity> {
        const lead = portalLeadEntityFromPrisma(row);
        const fields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.LEAD,
            row.id,
        );
        return { lead, fields };
    }
}
