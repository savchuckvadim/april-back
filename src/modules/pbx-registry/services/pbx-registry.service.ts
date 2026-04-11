import { Injectable } from '@nestjs/common';
import { PbxEntityType } from '@/shared/enums';
import {
    PbxFieldDefinition,
    PbxCategoryDefinition,
    PbxSmartDefinition,
    PbxRpaDefinition,
    PbxGroupDefinition,
} from '../interfaces';

@Injectable()
export class PbxRegistryService {
    private groups = new Map<string, PbxGroupDefinition>();

    registerGroup(definition: PbxGroupDefinition): void {
        this.groups.set(definition.group, definition);
    }

    getGroup(group: string): PbxGroupDefinition | undefined {
        return this.groups.get(group);
    }

    getAllGroups(): PbxGroupDefinition[] {
        return Array.from(this.groups.values());
    }

    getFieldsByGroup(group: string): readonly PbxFieldDefinition[] {
        return this.groups.get(group)?.fields ?? [];
    }

    getFieldByCode(code: string): PbxFieldDefinition | undefined {
        for (const group of this.groups.values()) {
            const found = group.fields.find(f => f.code === code);
            if (found) return found;
        }
        return undefined;
    }

    getFieldsForEntity(
        entityType: PbxEntityType,
        group?: string,
    ): PbxFieldDefinition[] {
        const sources = group
            ? ([this.groups.get(group)].filter(Boolean) as PbxGroupDefinition[])
            : Array.from(this.groups.values());

        return sources.flatMap(g =>
            g.fields.filter(f => {
                const suffix = f.suffixes[entityType];
                return suffix !== undefined && suffix !== '';
            }),
        );
    }

    getCategoriesByGroup(group: string): readonly PbxCategoryDefinition[] {
        return this.groups.get(group)?.categories ?? [];
    }

    getCategoryByCode(code: string): PbxCategoryDefinition | undefined {
        for (const group of this.groups.values()) {
            const found = group.categories.find(c => c.code === code);
            if (found) return found;
        }
        return undefined;
    }

    getCategoriesForEntity(
        entityType: PbxEntityType,
        group?: string,
    ): PbxCategoryDefinition[] {
        const sources = group
            ? ([this.groups.get(group)].filter(Boolean) as PbxGroupDefinition[])
            : Array.from(this.groups.values());

        return sources.flatMap(g =>
            g.categories.filter(c => c.entityType === entityType),
        );
    }

    getSmartsByGroup(group: string): readonly PbxSmartDefinition[] {
        return this.groups.get(group)?.smarts ?? [];
    }

    getSmartByCode(code: string): PbxSmartDefinition | undefined {
        for (const group of this.groups.values()) {
            const found = group.smarts?.find(s => s.code === code);
            if (found) return found;
        }
        return undefined;
    }

    getRpasByGroup(group: string): readonly PbxRpaDefinition[] {
        return this.groups.get(group)?.rpas ?? [];
    }

    getRpaByCode(code: string): PbxRpaDefinition | undefined {
        for (const group of this.groups.values()) {
            const found = group.rpas?.find(r => r.code === code);
            if (found) return found;
        }
        return undefined;
    }

    getAllFields(): PbxFieldDefinition[] {
        return Array.from(this.groups.values()).flatMap(g => [...g.fields]);
    }

    getAllCategories(): PbxCategoryDefinition[] {
        return Array.from(this.groups.values()).flatMap(g => [...g.categories]);
    }

    getAllSmarts(): PbxSmartDefinition[] {
        return Array.from(this.groups.values()).flatMap(g =>
            g.smarts ? [...g.smarts] : [],
        );
    }

    getAllRpas(): PbxRpaDefinition[] {
        return Array.from(this.groups.values()).flatMap(g =>
            g.rpas ? [...g.rpas] : [],
        );
    }
}
