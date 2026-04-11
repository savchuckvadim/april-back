import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PbxEntityType, getPrismaEntityTypeByType } from '@/shared/enums';
import { PbxRegistryService } from '../pbx-registry.service';
import { PbxCategoryDefinition, PbxStageDefinition } from '../../interfaces';
import { BitrixService } from '@/modules/bitrix';

export interface CategoryInstallResult {
    code: string;
    status: 'created' | 'exists' | 'error';
    bitrixId?: number;
    stagesInstalled?: number;
    error?: string;
}

export interface CategoryInstallOptions {
    entityType: PbxEntityType;
    entityDbId: bigint;
    group?: string;
    categoryCodes?: string[];
    withBitrixSync: boolean;
    bitrixEntityTypeId?: number | string;
}

@Injectable()
export class PbxCategoryInstallerService {
    private readonly logger = new Logger(PbxCategoryInstallerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: PbxRegistryService,
    ) {}

    async installCategories(
        options: CategoryInstallOptions,
        bitrixService?: BitrixService,
    ): Promise<CategoryInstallResult[]> {
        const {
            entityType,
            entityDbId,
            group,
            categoryCodes,
            withBitrixSync,
            bitrixEntityTypeId,
        } = options;

        let categories = this.registry.getCategoriesForEntity(
            entityType,
            group,
        );

        if (categoryCodes?.length) {
            categories = categories.filter(c => categoryCodes.includes(c.code));
        }

        const results: CategoryInstallResult[] = [];
        const prismaEntityType = getPrismaEntityTypeByType(entityType);

        for (const catDef of categories) {
            try {
                const result = await this.installCategory(
                    catDef,
                    entityDbId,
                    prismaEntityType,
                    entityType,
                    withBitrixSync,
                    bitrixEntityTypeId,
                    bitrixService,
                );
                results.push(result);
            } catch (error) {
                results.push({
                    code: catDef.code,
                    status: 'error',
                    error: (error as Error).message,
                });
            }
        }

        this.logger.log(
            `Installed ${results.filter(r => r.status === 'created').length} categories, ` +
                `${results.filter(r => r.status === 'exists').length} existed`,
        );

        return results;
    }

    private async installCategory(
        catDef: PbxCategoryDefinition,
        entityDbId: bigint,
        prismaEntityType: string,
        entityType: PbxEntityType,
        withBitrixSync: boolean,
        bitrixEntityTypeId?: number | string,
        bitrixService?: BitrixService,
    ): Promise<CategoryInstallResult> {
        const existing = await this.prisma.btx_categories.findFirst({
            where: {
                code: catDef.code,
                entity_id: entityDbId,
                entity_type: prismaEntityType,
            },
        });

        if (existing) {
            return {
                code: catDef.code,
                status: 'exists',
                bitrixId: Number(existing.bitrixId ?? 0),
            };
        }

        let bitrixCategoryId = '';

        if (withBitrixSync && bitrixService && bitrixEntityTypeId) {
            try {
                const bxResult = await bitrixService.category.add(
                    String(bitrixEntityTypeId),
                    { name: catDef.name, sort: catDef.sort },
                );
                if (bxResult?.result?.category?.id) {
                    bitrixCategoryId = String(bxResult.result.category.id);
                }
            } catch (error) {
                this.logger.warn(
                    `Bitrix category creation failed for ${catDef.code}: ${(error as Error).message}`,
                );
            }
        }

        const dbCategory = await this.prisma.btx_categories.create({
            data: {
                code: catDef.code,
                name: catDef.name,
                title: catDef.name,
                type: entityType,
                group: catDef.entityType,
                entity_id: entityDbId,
                entity_type: prismaEntityType,
                parent_type: entityType,
                bitrixId: bitrixCategoryId,
                bitrixCamelId: '',
                isActive: true,
            },
        });

        let stagesInstalled = 0;
        if (catDef.stages.length > 0) {
            stagesInstalled = await this.installStages(
                catDef.stages,
                dbCategory.id,
                catDef.code,
                withBitrixSync,
                bitrixEntityTypeId,
                bitrixCategoryId,
                bitrixService,
            );
        }

        return {
            code: catDef.code,
            status: 'created',
            bitrixId: bitrixCategoryId ? Number(bitrixCategoryId) : undefined,
            stagesInstalled,
        };
    }

    private async installStages(
        stages: readonly PbxStageDefinition[],
        categoryDbId: bigint,
        categoryCode: string,
        withBitrixSync: boolean,
        bitrixEntityTypeId?: number | string,
        bitrixCategoryId?: string,
        bitrixService?: BitrixService,
    ): Promise<number> {
        let count = 0;

        for (const stageDef of stages) {
            const existing = await this.prisma.btx_stages.findFirst({
                where: {
                    code: stageDef.code,
                    btx_category_id: categoryDbId,
                },
            });

            if (existing) continue;

            let bitrixStatusId = '';

            if (
                withBitrixSync &&
                bitrixService &&
                bitrixEntityTypeId &&
                bitrixCategoryId
            ) {
                try {
                    const entityId = this.buildStatusEntityId(
                        bitrixEntityTypeId,
                        bitrixCategoryId,
                    );
                    const bxResult = await bitrixService.status.add({
                        ENTITY_ID: entityId,
                        NAME: stageDef.name,
                        SORT: stageDef.sort,
                        COLOR: stageDef.color,
                    });
                    if (bxResult?.result) {
                        bitrixStatusId = String(bxResult.result);
                    }
                } catch (error) {
                    this.logger.warn(
                        `Bitrix stage creation failed for ${stageDef.code}: ${(error as Error).message}`,
                    );
                }
            }

            await this.prisma.btx_stages.create({
                data: {
                    code: stageDef.code,
                    name: stageDef.name,
                    title: stageDef.name,
                    bitrixId: bitrixStatusId,
                    color: stageDef.color ?? '#eef0e6',
                    btx_category_id: categoryDbId,
                    isActive: true,
                },
            });

            count++;
        }

        return count;
    }

    /**
     * Builds the Bitrix status entity ID (e.g., DEAL_STAGE_5 for category 5).
     */
    private buildStatusEntityId(
        entityTypeId: number | string,
        categoryId: string,
    ): string {
        if (categoryId === '0' || categoryId === '') {
            return 'DEAL_STAGE';
        }
        return `DEAL_STAGE_${categoryId}`;
    }
}
