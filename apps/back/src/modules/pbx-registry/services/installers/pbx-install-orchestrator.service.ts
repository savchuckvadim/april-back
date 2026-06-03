import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PbxEntityType } from '@/shared/enums';
import {
    PbxFieldInstallerService,
    FieldInstallResult,
} from './pbx-field-installer.service';
import {
    PbxCategoryInstallerService,
    CategoryInstallResult,
} from './pbx-category-installer.service';
import { PbxRegistryService } from '../pbx-registry.service';
import { BitrixService } from '@/modules/bitrix';

export interface PortalInstallOptions {
    portalId: bigint;
    group?: string;
    withBitrixSync: boolean;
}

export interface PortalInstallResult {
    portalId: bigint;
    fields: FieldInstallResult[];
    categories: CategoryInstallResult[];
}

@Injectable()
export class PbxInstallOrchestratorService {
    private readonly logger = new Logger(PbxInstallOrchestratorService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: PbxRegistryService,
        private readonly fieldInstaller: PbxFieldInstallerService,
        private readonly categoryInstaller: PbxCategoryInstallerService,
    ) {}

    /**
     * Install all definitions for a single portal.
     */
    async installForPortal(
        options: PortalInstallOptions,
        bitrixService?: BitrixService,
    ): Promise<PortalInstallResult> {
        const { portalId, group, withBitrixSync } = options;

        this.logger.log(`Starting installation for portal ${portalId}`);

        const allFieldResults: FieldInstallResult[] = [];
        const allCategoryResults: CategoryInstallResult[] = [];

        const entityTypes: PbxEntityType[] = [
            PbxEntityType.DEAL,
            PbxEntityType.LEAD,
            PbxEntityType.BTX_COMPANY,
            PbxEntityType.BTX_CONTACT,
        ];

        for (const entityType of entityTypes) {
            const entityDbId = await this.getOrCreateEntityRecord(
                portalId,
                entityType,
            );
            if (!entityDbId) continue;

            const fieldResults = await this.fieldInstaller.installFields(
                {
                    portalId,
                    entityType,
                    entityDbId,
                    group,
                    withBitrixSync,
                },
                bitrixService,
            );
            allFieldResults.push(...fieldResults);

            const categoryResults =
                await this.categoryInstaller.installCategories(
                    {
                        entityType,
                        entityDbId,
                        group,
                        withBitrixSync,
                    },
                    bitrixService,
                );
            allCategoryResults.push(...categoryResults);
        }

        this.logger.log(
            `Installation complete for portal ${portalId}: ` +
                `${allFieldResults.length} field operations, ` +
                `${allCategoryResults.length} category operations`,
        );

        return {
            portalId,
            fields: allFieldResults,
            categories: allCategoryResults,
        };
    }

    /**
     * Mass install for all portals.
     */
    async installForAllPortals(
        options: Omit<PortalInstallOptions, 'portalId'>,
        bitrixServiceFactory?: (portalId: bigint) => Promise<BitrixService>,
    ): Promise<PortalInstallResult[]> {
        const portals = await this.prisma.portal.findMany({
            select: { id: true, domain: true },
        });

        this.logger.log(`Mass install: ${portals.length} portals`);

        const results: PortalInstallResult[] = [];

        for (const portal of portals) {
            try {
                let bitrixService: BitrixService | undefined;
                if (options.withBitrixSync && bitrixServiceFactory) {
                    bitrixService = await bitrixServiceFactory(portal.id);
                }

                const result = await this.installForPortal(
                    { ...options, portalId: portal.id },
                    bitrixService,
                );
                results.push(result);
            } catch (error) {
                this.logger.error(
                    `Install failed for portal ${portal.id} (${portal.domain}): ${(error as Error).message}`,
                );
            }
        }

        return results;
    }

    /**
     * Get or create the entity record (btx_deals, btx_leads, etc.) for a portal.
     */
    private async getOrCreateEntityRecord(
        portalId: bigint,
        entityType: PbxEntityType,
    ): Promise<bigint | null> {
        switch (entityType) {
            case PbxEntityType.DEAL: {
                const entity = await this.prisma.btx_deals.findFirst({
                    where: { portal_id: portalId },
                });
                if (entity) return entity.id;
                const created = await this.prisma.btx_deals.create({
                    data: {
                        portal_id: portalId,
                        name: 'deal',
                        title: 'Deal',
                        code: 'deal',
                    },
                });
                return created.id;
            }
            case PbxEntityType.LEAD: {
                const entity = await this.prisma.btx_leads.findFirst({
                    where: { portal_id: portalId },
                });
                if (entity) return entity.id;
                const created = await this.prisma.btx_leads.create({
                    data: {
                        portal_id: portalId,
                        name: 'lead',
                        title: 'Lead',
                        code: 'lead',
                    },
                });
                return created.id;
            }
            case PbxEntityType.BTX_COMPANY: {
                const entity = await this.prisma.btx_companies.findFirst({
                    where: { portal_id: portalId },
                });
                if (entity) return entity.id;
                const created = await this.prisma.btx_companies.create({
                    data: {
                        portal_id: portalId,
                        name: 'company',
                        title: 'Company',
                        code: 'company',
                    },
                });
                return created.id;
            }
            case PbxEntityType.BTX_CONTACT: {
                const entity = await this.prisma.btx_contacts.findFirst({
                    where: { portal_id: portalId },
                });
                if (entity) return entity.id;
                const created = await this.prisma.btx_contacts.create({
                    data: {
                        portal_id: portalId,
                        name: 'contact',
                        title: 'Contact',
                        code: 'contact',
                    },
                });
                return created.id;
            }
            default:
                return null;
        }
    }
}
