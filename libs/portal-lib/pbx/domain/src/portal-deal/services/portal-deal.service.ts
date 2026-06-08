import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import type { btx_deals } from 'generated/prisma';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PortalDealRepository } from '../repositories/portal-deal.repository';
import { CreatePortalDealDto } from '../dto/create-portal-deal.dto';
import { UpdatePortalDealDto } from '../dto/update-portal-deal.dto';
import { PortalDealResponseDto } from '../dto/portal-deal-response.dto';
import { PortalDealWithFieldsResponseDto } from '../dto/portal-deal-with-fields-response.dto';
import {
    portalDealEntityFromPrisma,
    portalDealEntityToResponseDto,
    portalDealPrismaCreateFromDto,
    portalDealPrismaUpdatePatch,
    portalDealWithFieldsToResponseDto,
} from '../utils/portal-deal-entity.util';
import type { PortalDealWithFieldsEntity } from '../entity/portal-deal-with-fields.entity';

@Injectable()
export class PortalDealService {
    constructor(
        private readonly repository: PortalDealRepository,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async create(dto: CreatePortalDealDto): Promise<PortalDealResponseDto> {
        const existing = await this.repository.findFirstByPortalId(
            dto.portalId,
        );
        if (existing) {
            throw new ConflictException(
                `У портала ${dto.portalId} уже есть сделка (id=${existing.id.toString()}).`,
            );
        }
        const row = await this.repository.create(
            portalDealPrismaCreateFromDto(dto),
        );
        return portalDealEntityToResponseDto(portalDealEntityFromPrisma(row));
    }

    async findById(id: number): Promise<PortalDealResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Portal deal id=${id} not found`);
        }
        return portalDealEntityToResponseDto(portalDealEntityFromPrisma(row));
    }

    async findByPortalId(
        portalId: number,
    ): Promise<PortalDealResponseDto | null> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            return null;
        }
        return portalDealEntityToResponseDto(portalDealEntityFromPrisma(row));
    }

    async findMany(): Promise<PortalDealResponseDto[]> {
        const rows = await this.repository.findMany();
        return rows.map(r =>
            portalDealEntityToResponseDto(portalDealEntityFromPrisma(r)),
        );
    }

    async findWithFieldsByPortalId(
        portalId: number,
    ): Promise<PortalDealWithFieldsResponseDto | null> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            return null;
        }
        const agg = await this.buildWithFields(row);
        return portalDealWithFieldsToResponseDto(agg);
    }

    async findWithFieldsByDealId(
        id: number,
    ): Promise<PortalDealWithFieldsResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Portal deal id=${id} not found`);
        }
        const agg = await this.buildWithFields(row);
        return portalDealWithFieldsToResponseDto(agg);
    }

    async update(
        id: number,
        dto: UpdatePortalDealDto,
    ): Promise<PortalDealResponseDto> {
        await this.findById(id);
        if (dto.portalId != null) {
            const other = await this.repository.findFirstByPortalId(
                dto.portalId,
            );
            if (other && other.id !== BigInt(id)) {
                throw new ConflictException(
                    `Портал ${dto.portalId} уже привязан к другой сделке.`,
                );
            }
        }
        const patch = portalDealPrismaUpdatePatch(dto);
        const row = await this.repository.update(id, patch);
        return portalDealEntityToResponseDto(portalDealEntityFromPrisma(row));
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.DEAL,
            BigInt(id),
        );
        await this.repository.delete(id);
    }

    /** Удалить все PBX-поля сделки портала (строка `btx_deals` не трогается). */
    async deleteAllFieldsForPortal(portalId: number): Promise<void> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Сделка для портала portalId=${portalId} не найдена`,
            );
        }
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.DEAL,
            row.id,
        );
    }

    private async buildWithFields(
        row: btx_deals,
    ): Promise<PortalDealWithFieldsEntity> {
        const deal = portalDealEntityFromPrisma(row);
        const fields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.DEAL,
            row.id,
        );
        return { deal, fields };
    }
}
