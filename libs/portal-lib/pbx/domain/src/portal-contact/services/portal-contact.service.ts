import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import type { btx_contacts } from 'generated/prisma';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PortalContactRepository } from '../repositories/portal-contact.repository';
import { CreatePortalContactDto } from '../dto/create-portal-contact.dto';
import { UpdatePortalContactDto } from '../dto/update-portal-contact.dto';
import { PortalContactResponseDto } from '../dto/portal-contact-response.dto';
import { PortalContactWithFieldsResponseDto } from '../dto/portal-contact-with-fields-response.dto';
import {
    portalContactEntityFromPrisma,
    portalContactEntityToResponseDto,
    portalContactPrismaCreateFromDto,
    portalContactPrismaUpdatePatch,
    portalContactWithFieldsToResponseDto,
} from '../utils/portal-contact-entity.util';
import type { PortalContactWithFieldsEntity } from '../entity/portal-contact-with-fields.entity';

@Injectable()
export class PortalContactService {
    constructor(
        private readonly repository: PortalContactRepository,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async create(
        dto: CreatePortalContactDto,
    ): Promise<PortalContactResponseDto> {
        const existing = await this.repository.findFirstByPortalId(
            dto.portalId,
        );
        if (existing) {
            throw new ConflictException(
                `У портала ${dto.portalId} уже есть контакт (id=${existing.id.toString()}).`,
            );
        }
        const row = await this.repository.create(
            portalContactPrismaCreateFromDto(dto),
        );
        return portalContactEntityToResponseDto(
            portalContactEntityFromPrisma(row),
        );
    }

    async findById(id: number): Promise<PortalContactResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Portal contact id=${id} not found`);
        }
        return portalContactEntityToResponseDto(
            portalContactEntityFromPrisma(row),
        );
    }

    async findByPortalId(
        portalId: number,
    ): Promise<PortalContactResponseDto | null> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            return null;
        }
        return portalContactEntityToResponseDto(
            portalContactEntityFromPrisma(row),
        );
    }

    async findMany(): Promise<PortalContactResponseDto[]> {
        const rows = await this.repository.findMany();
        return rows.map(r =>
            portalContactEntityToResponseDto(portalContactEntityFromPrisma(r)),
        );
    }

    async findWithFieldsByPortalId(
        portalId: number,
    ): Promise<PortalContactWithFieldsResponseDto | null> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            return null;
        }
        const agg = await this.buildWithFields(row);
        return portalContactWithFieldsToResponseDto(agg);
    }

    async findWithFieldsByContactId(
        id: number,
    ): Promise<PortalContactWithFieldsResponseDto> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Portal contact id=${id} not found`);
        }
        const agg = await this.buildWithFields(row);
        return portalContactWithFieldsToResponseDto(agg);
    }

    async update(
        id: number,
        dto: UpdatePortalContactDto,
    ): Promise<PortalContactResponseDto> {
        await this.findById(id);
        if (dto.portalId != null) {
            const other = await this.repository.findFirstByPortalId(
                dto.portalId,
            );
            if (other && other.id !== BigInt(id)) {
                throw new ConflictException(
                    `Портал ${dto.portalId} уже привязан к другому контакту.`,
                );
            }
        }
        const patch = portalContactPrismaUpdatePatch(dto);
        const row = await this.repository.update(id, patch);
        return portalContactEntityToResponseDto(
            portalContactEntityFromPrisma(row),
        );
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.BTX_CONTACT,
            BigInt(id),
        );
        await this.repository.delete(id);
    }

    /** Удалить все PBX-поля контакта портала (строка `btx_contacts` не трогается). */
    async deleteAllFieldsForPortal(portalId: number): Promise<void> {
        const row = await this.repository.findFirstByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Контакт для портала portalId=${portalId} не найден`,
            );
        }
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.BTX_CONTACT,
            row.id,
        );
    }

    private async buildWithFields(
        row: btx_contacts,
    ): Promise<PortalContactWithFieldsEntity> {
        const contact = portalContactEntityFromPrisma(row);
        const fields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.BTX_CONTACT,
            row.id,
        );
        return { contact, fields };
    }
}
