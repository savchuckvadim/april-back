import { Injectable } from '@nestjs/common';
import {
    PbxRegistryService,
    PbxEntityAccessorService,
    PbxInstallOrchestratorService,
} from '@/modules/pbx-registry';
import { PBXService } from '@/modules/pbx';
import { PbxEntityType } from '@/shared/enums';

@Injectable()
export class PbxAdminService {
    constructor(
        private readonly registry: PbxRegistryService,
        private readonly orchestrator: PbxInstallOrchestratorService,
        private readonly accessor: PbxEntityAccessorService,
        private readonly pbx: PBXService,
    ) {}

    getRegistryInfo() {
        const groups = this.registry.getAllGroups();
        return {
            totalGroups: groups.length,
            totalFields: this.registry.getAllFields().length,
            totalCategories: this.registry.getAllCategories().length,
            totalSmarts: this.registry.getAllSmarts().length,
            totalRpas: this.registry.getAllRpas().length,
            groups: groups.map(g => g.group),
        };
    }

    getFieldsByGroup(group: string) {
        const fields = this.registry.getFieldsByGroup(group);
        return {
            group,
            count: fields.length,
            fields: fields.map(f => ({
                code: f.code,
                name: f.name,
                type: f.type,
                appType: f.appType,
                suffixes: f.suffixes,
                itemsCount: f.items?.length ?? 0,
            })),
        };
    }

    getCategoriesByGroup(group: string) {
        const categories = this.registry.getCategoriesByGroup(group);
        return {
            group,
            count: categories.length,
            categories: categories.map(c => ({
                code: c.code,
                name: c.name,
                entityType: c.entityType,
                stagesCount: c.stages.length,
                stages: c.stages.map(s => ({
                    code: s.code,
                    name: s.name,
                    color: s.color,
                })),
            })),
        };
    }

    getSmarts() {
        return this.registry.getAllSmarts().map(s => ({
            code: s.code,
            title: s.title,
            categoriesCount: s.categories?.length ?? 0,
            categories: s.categories?.map(c => ({
                code: c.code,
                name: c.name,
                stagesCount: c.stages.length,
            })),
        }));
    }

    getRpas() {
        return this.registry.getAllRpas().map(r => ({
            code: r.code,
            title: r.title,
            stagesCount: r.stages?.length ?? 0,
            stages: r.stages?.map(s => ({
                code: s.code,
                name: s.name,
            })),
        }));
    }

    getFieldByCode(code: string) {
        const field = this.registry.getFieldByCode(code);
        if (!field) return { found: false, code };
        return {
            found: true,
            code: field.code,
            name: field.name,
            type: field.type,
            appType: field.appType,
            suffixes: field.suffixes,
            items: field.items,
        };
    }

    async installForPortal(
        portalId: number,
        group?: string,
        withBitrixSync = false,
    ) {
        return this.orchestrator.installForPortal({
            portalId: BigInt(portalId),
            group,
            withBitrixSync,
        });
    }

    async massInstall(group?: string, withBitrixSync = false) {
        return this.orchestrator.installForAllPortals({
            group,
            withBitrixSync,
        });
    }

    async getPortalStatus(domain: string) {
        const { portal } = await this.pbx.init(domain);
        const portalId = BigInt(portal.id ?? 0);

        const registryFields = this.registry.getAllFields();
        const registryCategories = this.registry.getAllCategories();
        const registrySmarts = this.registry.getAllSmarts();

        const entityTypes = [
            PbxEntityType.DEAL,
            PbxEntityType.LEAD,
            PbxEntityType.BTX_COMPANY,
        ];

        const entitiesStatus: Record<string, unknown> = {};

        for (const entityType of entityTypes) {
            try {
                const ctx = await this.accessor.forEntity(
                    portalId,
                    entityType,
                    portalId,
                );
                const installed: string[] = [];
                const missing: string[] = [];

                for (const field of registryFields) {
                    const suffix = field.suffixes[entityType];
                    if (!suffix) continue;
                    if (ctx.hasField(field.code)) {
                        installed.push(field.code);
                    } else {
                        missing.push(field.code);
                    }
                }

                entitiesStatus[entityType] = {
                    installed: installed.length,
                    missing: missing.length,
                    missingCodes: missing.slice(0, 20),
                };
            } catch {
                entitiesStatus[entityType] = { error: 'Could not resolve' };
            }
        }

        return {
            domain,
            portalId: portal.id,
            registry: {
                totalFields: registryFields.length,
                totalCategories: registryCategories.length,
                totalSmarts: registrySmarts.length,
            },
            entities: entitiesStatus,
        };
    }
}
