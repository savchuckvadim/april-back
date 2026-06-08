import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import type { btx_companies } from 'generated/prisma';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PortalCompanyRepository } from '../repositories/portal-company.repository';
import { CreatePortalCompanyDto } from '../dto/create-portal-company.dto';
import { UpdatePortalCompanyDto } from '../dto/update-portal-company.dto';
import { PortalCompanyResponseDto } from '../dto/portal-company-response.dto';
import { PortalCompanyWithFieldsResponseDto } from '../dto/portal-company-with-fields-response.dto';
import {
    portalCompanyEntityFromPrisma,
    portalCompanyEntityToResponseDto,
    portalCompanyPrismaCreateFromDto,
    portalCompanyPrismaUpdatePatch,
    portalCompanyWithFieldsToResponseDto,
} from '../utils/portal-company-entity.util';
import type { PortalCompanyWithFieldsEntity } from '../entity/portal-company-with-fields.entity';

@Injectable()
export class PortalCompanyService {
    constructor(
        private readonly repository: PortalCompanyRepository,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async create(
        dto: CreatePortalCompanyDto,
    ): Promise<PortalCompanyResponseDto> {
        const existing = await this.repository.findFirstByPortalId(
            dto.portalId,
        );
        if (existing) {
            throw new ConflictException(
                `У портала ${dto.portalId} уже есть компания (id=${existing.id.toString()}).`,
            );
        }
        const row = await this.repository.create(
            portalCompanyPrismaCreateFromDto(dto),
        );
        return portalCompanyEntityToResponseDto(
            portalCompanyEntityFromPrisma(row),
        );
    }

    async findById(id: number): Promise<PortalCompanyResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Portal company id=${id} not found`);
        }
        return portalCompanyEntityToResponseDto(
            portalCompanyEntityFromPrisma(row),
        );
    }

    async findByPortalId(
        portalId: number,
    ): Promise<PortalCompanyResponseDto | null> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            return null;
        }
        return portalCompanyEntityToResponseDto(
            portalCompanyEntityFromPrisma(row),
        );
    }

    async findMany(): Promise<PortalCompanyResponseDto[]> {
        const rows = await this.repository.findMany();
        return rows.map(r =>
            portalCompanyEntityToResponseDto(portalCompanyEntityFromPrisma(r)),
        );
    }

    async findWithFieldsByPortalId(
        portalId: number,
    ): Promise<PortalCompanyWithFieldsResponseDto | null> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            return null;
        }
        const agg = await this.buildWithFields(row);
        return portalCompanyWithFieldsToResponseDto(agg);
    }

    async findWithFieldsByCompanyId(
        id: number,
    ): Promise<PortalCompanyWithFieldsResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Portal company id=${id} not found`);
        }
        const agg = await this.buildWithFields(row);
        return portalCompanyWithFieldsToResponseDto(agg);
    }

    async update(
        id: number,
        dto: UpdatePortalCompanyDto,
    ): Promise<PortalCompanyResponseDto> {
        await this.findById(id);
        if (dto.portalId != null) {
            const other = await this.repository.findFirstByPortalId(
                dto.portalId,
            );
            if (other && other.id !== BigInt(id)) {
                throw new ConflictException(
                    `Портал ${dto.portalId} уже привязан к другой компании.`,
                );
            }
        }
        const patch = portalCompanyPrismaUpdatePatch(dto);
        const row = await this.repository.update(id, patch);
        return portalCompanyEntityToResponseDto(
            portalCompanyEntityFromPrisma(row),
        );
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.BTX_COMPANY,
            BigInt(id),
        );
        await this.repository.delete(id);
    }

    /** Удалить все PBX-поля компании портала (строка `btx_companies` не трогается). */
    async deleteAllFieldsForPortal(portalId: number): Promise<void> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Компания для портала portalId=${portalId} не найдена`,
            );
        }
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.BTX_COMPANY,
            row.id,
        );
    }

    private async buildWithFields(
        row: btx_companies,
    ): Promise<PortalCompanyWithFieldsEntity> {
        const company = portalCompanyEntityFromPrisma(row);
        const fields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.BTX_COMPANY,
            row.id,
        );
        return { company, fields };
    }
}
