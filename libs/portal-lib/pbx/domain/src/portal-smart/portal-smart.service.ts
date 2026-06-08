import { PrismaService } from '@/core/prisma';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field/';
import {
    BtxCategoryRepository,
    PortalCategoryEntity,
} from '@lib/portal-lib/pbx-domain/category';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { bigintConvertToNumber } from '@/shared';
import { Prisma } from 'generated/prisma';
import { getPortalSmartEntity } from './utils/portal-smart-entity.util';
import { PortalSmartEntity } from './entity/portal-smart.entity';
import type { PortalSmartRow } from './types/portal-smart-row.type';
import { IBXSmartType } from '@/modules/bitrix/domain/crm/smart-type';
import { CreatePortalSmartDto } from './dto/create-portal-smart.dto';
import { UpdatePortalSmartDto } from './dto/update-portal-smart.dto';
import { PortalSmartRowResponseDto } from './dto/portal-smart-row-response.dto';
import { PortalSmartsListResponseDto } from './dto/portal-smarts-list-response.dto';

@Injectable()
export class PortalSmartService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly pbxFieldService: PbxFieldService,
        private readonly portalService: PortalStoreService,
        private readonly categoryRepository: BtxCategoryRepository,
    ) {}

    /** Строка из БД по порталу + type/group (как после инсталла). */
    async findFirstByPortalTypeGroup(
        portalId: bigint,
        type: string,
        group: string,
    ): Promise<PortalSmartRow | null> {
        return this.prisma.smarts.findFirst({
            where: {
                portal_id: portalId,
                type,
                group,
            },
        });
    }

    /** Upsert строки смарта после успешного ответа Bitrix `crm.type.add`. */
    async upsertFromBitrix(
        domain: string,
        bxSmart: IBXSmartType,
        type: string,
        group: string,
    ): Promise<void> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found');
        }
        const portalId = BigInt(portal.id);
        const existing = await this.findFirstByPortalTypeGroup(
            portalId,
            type,
            group,
        );
        const entityTypeId = Number(bxSmart.entityTypeId);
        const updatedData = {
            entityTypeId: BigInt(entityTypeId),
            name: bxSmart.title,
            title: bxSmart.title,
            bitrixId: BigInt(Number(bxSmart.id)),
            updated_at: new Date(),
            forStage: `DT${entityTypeId}_`,
            forStageId: BigInt(entityTypeId),
            crmId: BigInt(entityTypeId),
            forFilterId: BigInt(entityTypeId),
            forFilter: `DYNAMIC_${entityTypeId}_`,
        };
        if (!existing) {
            await this.prisma.smarts.create({
                data: {
                    portal_id: portalId,
                    type,
                    group,
                    created_at: new Date(),
                    ...updatedData,
                },
            });
        } else {
            await this.prisma.smarts.update({
                where: { id: existing.id },
                data: updatedData,
            });
        }
    }

    mapRowToResponseDto(row: PortalSmartRow): PortalSmartRowResponseDto {
        return {
            id: bigintConvertToNumber(row.id),
            portalId: bigintConvertToNumber(row.portal_id),
            type: row.type,
            group: row.group,
            name: row.name,
            title: row.title,
            bitrixId:
                row.bitrixId != null
                    ? bigintConvertToNumber(row.bitrixId)
                    : null,
            entityTypeId: bigintConvertToNumber(row.entityTypeId),
            forStageId:
                row.forStageId != null
                    ? bigintConvertToNumber(row.forStageId)
                    : null,
            forFilterId:
                row.forFilterId != null
                    ? bigintConvertToNumber(row.forFilterId)
                    : null,
            crmId: row.crmId != null ? bigintConvertToNumber(row.crmId) : null,
            forStage: row.forStage,
            forFilter: row.forFilter,
            crm: row.crm,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }

    async findRowById(id: bigint): Promise<PortalSmartRowResponseDto> {
        const row = await this.prisma.smarts.findUnique({ where: { id } });
        if (!row) {
            throw new NotFoundException('Smart not found');
        }
        return this.mapRowToResponseDto(row);
    }

    async listRowsByDomain(
        domain: string,
    ): Promise<PortalSmartsListResponseDto> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: { id: true },
        });
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const rows = await this.prisma.smarts.findMany({
            where: { portal_id: portal.id },
            orderBy: { id: 'asc' },
        });
        return {
            domain,
            portalId: bigintConvertToNumber(portal.id),
            smarts: rows.map(r => this.mapRowToResponseDto(r)),
        };
    }

    async findRowByDomainAndKeys(
        domain: string,
        type: string,
        group: string,
    ): Promise<PortalSmartRowResponseDto> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const row = await this.findFirstByPortalTypeGroup(
            BigInt(portal.id.toString()),
            type,
            group,
        );
        if (!row) {
            throw new NotFoundException('Smart not found');
        }
        return this.mapRowToResponseDto(row);
    }

    async createRow(
        dto: CreatePortalSmartDto,
    ): Promise<PortalSmartRowResponseDto> {
        const row = await this.prisma.smarts.create({
            data: {
                portal_id: BigInt(dto.portalId),
                type: dto.type,
                group: dto.group,
                name: dto.name,
                title: dto.title,
                ...(dto.bitrixId != null
                    ? { bitrixId: BigInt(dto.bitrixId) }
                    : {}),
                entityTypeId: BigInt(dto.entityTypeId),
                ...(dto.forStageId != null
                    ? { forStageId: BigInt(dto.forStageId) }
                    : {}),
                ...(dto.forFilterId != null
                    ? { forFilterId: BigInt(dto.forFilterId) }
                    : {}),
                ...(dto.crmId != null ? { crmId: BigInt(dto.crmId) } : {}),
                forStage: dto.forStage,
                forFilter: dto.forFilter,
                crm: dto.crm,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
        return this.mapRowToResponseDto(row);
    }

    async updateRow(
        id: bigint,
        dto: UpdatePortalSmartDto,
    ): Promise<PortalSmartRowResponseDto> {
        const data: Prisma.smartsUncheckedUpdateInput = {
            updated_at: new Date(),
        };
        if (dto.portalId !== undefined) {
            data.portal_id = BigInt(dto.portalId);
        }
        if (dto.type !== undefined) data.type = dto.type;
        if (dto.group !== undefined) data.group = dto.group;
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.bitrixId !== undefined) {
            data.bitrixId = dto.bitrixId != null ? BigInt(dto.bitrixId) : null;
        }
        if (dto.entityTypeId !== undefined) {
            data.entityTypeId = BigInt(dto.entityTypeId);
        }
        if (dto.forStageId !== undefined) {
            data.forStageId =
                dto.forStageId != null ? BigInt(dto.forStageId) : null;
        }
        if (dto.forFilterId !== undefined) {
            data.forFilterId =
                dto.forFilterId != null ? BigInt(dto.forFilterId) : null;
        }
        if (dto.crmId !== undefined) {
            data.crmId = dto.crmId != null ? BigInt(dto.crmId) : null;
        }
        if (dto.forStage !== undefined) data.forStage = dto.forStage;
        if (dto.forFilter !== undefined) data.forFilter = dto.forFilter;
        if (dto.crm !== undefined) data.crm = dto.crm;

        const row = await this.prisma.smarts.update({
            where: { id },
            data,
        });
        return this.mapRowToResponseDto(row);
    }

    /** Только строка `smarts` (поля и категории в БД не трогаются). */
    async deleteRowById(id: bigint): Promise<{ deletedId: number }> {
        await this.prisma.smarts.delete({ where: { id } });
        return { deletedId: bigintConvertToNumber(id) };
    }

    /**
     * Удаление смарта как при «откате инсталла»: поля сущности SMART + строка смарта.
     */
    async deleteSmartCascade(id: bigint): Promise<{ deleted: number }> {
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.SMART,
            id,
        );
        await this.prisma.smarts.delete({
            where: { id },
        });
        return {
            deleted: bigintConvertToNumber(id),
        };
    }

    async getSmartByPortalAndName(
        domain: string,
        smartType: string,
        smartGroup?: string,
    ): Promise<PortalSmartEntity> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found');
        }
        const smart = await this.findSmartRowByPortal(
            BigInt(portal.id.toString()),
            smartType,
            smartGroup,
        );
        return this.buildSmartEntity(smart);
    }

    async getSmartsByPortalDomain(domain: string) {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: {
                id: true,
                domain: true,
                smarts: true,
            },
        });
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const smarts = await Promise.all(
            portal.smarts.map(async smart => this.buildSmartEntity(smart)),
        );
        return {
            ...portal,
            id: bigintConvertToNumber(portal.id),
            smarts,
        };
    }

    private async buildSmartEntity(
        smart: PortalSmartRow,
    ): Promise<PortalSmartEntity> {
        const categories = await this.getSmartCategories(smart.id);
        const fields = await this.getSmartFields(smart.id);
        return getPortalSmartEntity(smart, categories, fields);
    }

    private async getSmartFields(smartId: bigint) {
        return this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.SMART,
            smartId,
        );
    }

    private async getSmartCategories(
        smartId: bigint,
    ): Promise<PortalCategoryEntity[]> {
        const categories = await this.categoryRepository.findByEntity(
            PbxEntityTypePrisma.SMART,
            Number(smartId),
        );
        return categories ?? [];
    }

    private async findSmartRowByPortal(
        portalId: bigint,
        smartType?: string,
        smartGroup?: string,
    ): Promise<PortalSmartRow> {
        const where: Prisma.smartsFindManyArgs['where'] = {
            portal_id: portalId,
        };
        if (smartType) {
            where.type = smartType;
        }
        if (smartGroup) {
            where.group = smartGroup;
        }
        const smart = await this.prisma.smarts.findFirst({
            where,
        });
        if (!smart) {
            throw new Error('Smart not found');
        }
        return smart;
    }
}
