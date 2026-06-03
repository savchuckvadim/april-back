import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PbxEntityType, getPrismaEntityTypeByType } from '@/shared/enums';
import { PbxRegistryService } from './pbx-registry.service';
import {
    PbxResolvedField,
    PbxResolvedCategory,
    PbxResolvedStage,
    PbxResolvedSmart,
} from '../interfaces';

@Injectable()
export class PbxResolverService {
    private readonly logger = new Logger(PbxResolverService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: PbxRegistryService,
    ) {}

    /**
     * Resolve a field code to a Bitrix field name for a specific entity DB record.
     * Returns the full Bitrix field name (e.g., UF_CRM_XO_NAME or UF_CRM_134_XO_NAME).
     */
    async resolveFieldBitrixId(
        entityDbId: bigint,
        entityType: PbxEntityType,
        fieldCode: string,
    ): Promise<string | null> {
        const prismaEntityType = getPrismaEntityTypeByType(entityType);

        const field = await this.prisma.bitrixfields.findFirst({
            where: {
                code: fieldCode,
                entity_id: entityDbId,
                entity_type: prismaEntityType,
            },
        });

        return field?.bitrixId ?? null;
    }

    /**
     * Resolve all fields for an entity DB record, returning a map of code -> bitrixId.
     */
    async resolveAllFields(
        entityDbId: bigint,
        entityType: PbxEntityType,
    ): Promise<Map<string, PbxResolvedField>> {
        const prismaEntityType = getPrismaEntityTypeByType(entityType);

        const dbFields = await this.prisma.bitrixfields.findMany({
            where: {
                entity_id: entityDbId,
                entity_type: prismaEntityType,
            },
        });

        const result = new Map<string, PbxResolvedField>();
        for (const dbField of dbFields) {
            if (!dbField.code) continue;
            const definition = this.registry.getFieldByCode(dbField.code);
            if (!definition) continue;

            result.set(dbField.code, {
                code: dbField.code,
                definition,
                dbId: dbField.id,
                bitrixId: dbField.bitrixId ?? '',
                bitrixCamelId: dbField.bitrixCamelId ?? '',
                entityType,
            });
        }

        return result;
    }

    /**
     * Resolve a category code to a Bitrix category ID for a specific portal.
     * Categories are linked to portals through entity_id -> entity (btx_deals etc.) -> portal_id.
     */
    async resolveCategoryBitrixId(
        entityDbId: bigint,
        categoryCode: string,
    ): Promise<number | null> {
        const category = await this.prisma.btx_categories.findFirst({
            where: {
                code: categoryCode,
                entity_id: entityDbId,
            },
        });

        if (!category?.bitrixId) return null;
        return Number(category.bitrixId);
    }

    /**
     * Resolve all categories for a given entity DB record.
     */
    async resolveAllCategories(
        entityDbId: bigint,
    ): Promise<Map<string, PbxResolvedCategory>> {
        const dbCategories = await this.prisma.btx_categories.findMany({
            where: { entity_id: entityDbId },
        });

        const result = new Map<string, PbxResolvedCategory>();
        for (const dbCat of dbCategories) {
            if (!dbCat.code) continue;
            const definition = this.registry.getCategoryByCode(dbCat.code);
            if (!definition) continue;

            result.set(dbCat.code, {
                code: dbCat.code,
                definition,
                dbId: dbCat.id,
                bitrixId: Number(dbCat.bitrixId ?? 0),
            });
        }

        return result;
    }

    /**
     * Resolve a stage code to a Bitrix status ID for a specific category.
     */
    async resolveStageBitrixId(
        categoryDbId: bigint,
        stageCode: string,
    ): Promise<string | null> {
        const stage = await this.prisma.btx_stages.findFirst({
            where: {
                code: stageCode,
                btx_category_id: categoryDbId,
            },
        });

        return stage?.bitrixId ?? null;
    }

    /**
     * Resolve all stages for a given category DB record.
     */
    async resolveAllStages(
        categoryDbId: bigint,
    ): Promise<Map<string, PbxResolvedStage>> {
        const dbStages = await this.prisma.btx_stages.findMany({
            where: { btx_category_id: categoryDbId },
        });

        const result = new Map<string, PbxResolvedStage>();
        for (const dbStage of dbStages) {
            if (!dbStage.code) continue;

            const category = await this.prisma.btx_categories.findUnique({
                where: { id: categoryDbId },
            });
            const catDef = category?.code
                ? this.registry.getCategoryByCode(category.code)
                : undefined;
            const stageDef = catDef?.stages.find(s => s.code === dbStage.code);
            if (!stageDef) continue;

            result.set(dbStage.code, {
                code: dbStage.code,
                definition: stageDef,
                dbId: dbStage.id,
                bitrixId: dbStage.bitrixId ?? '',
            });
        }

        return result;
    }

    /**
     * Resolve a smart process code to its entityTypeId for a specific portal.
     */
    async resolveSmartEntityTypeId(
        portalId: bigint,
        smartCode: string,
    ): Promise<number | null> {
        const smart = await this.prisma.smarts.findFirst({
            where: {
                type: smartCode,
                portal_id: portalId,
            },
        });

        if (!smart?.bitrixId) return null;
        return Number(smart.bitrixId);
    }

    /**
     * Resolve all smarts for a portal, returning a map of code -> resolved smart.
     */
    async resolveAllSmarts(
        portalId: bigint,
    ): Promise<Map<string, PbxResolvedSmart>> {
        const dbSmarts = await this.prisma.smarts.findMany({
            where: { portal_id: portalId },
        });

        const result = new Map<string, PbxResolvedSmart>();
        for (const dbSmart of dbSmarts) {
            const smartCode = dbSmart.type;
            if (!smartCode) continue;
            const definition = this.registry.getSmartByCode(smartCode);
            if (!definition) continue;

            result.set(smartCode, {
                code: smartCode,
                definition,
                dbId: dbSmart.id,
                entityTypeId: Number(dbSmart.bitrixId ?? 0),
            });
        }

        return result;
    }

    /**
     * Build the full Bitrix field name for a CRM entity.
     * For CRM entities: UF_CRM_{SUFFIX}
     * For smart processes: UF_CRM_{entityTypeId}_{SUFFIX}
     */
    buildBitrixFieldName(
        entityType: PbxEntityType,
        suffix: string,
        smartEntityTypeId?: number,
    ): string {
        if (entityType === PbxEntityType.SMART && smartEntityTypeId) {
            return `UF_CRM_${smartEntityTypeId}_${suffix}`;
        }
        return `UF_CRM_${suffix}`;
    }
}
