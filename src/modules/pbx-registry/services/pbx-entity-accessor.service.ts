import { Injectable, Logger } from '@nestjs/common';
import { PbxEntityType } from '@/shared/enums';
import { PbxResolverService } from './pbx-resolver.service';
import { PbxRegistryService } from './pbx-registry.service';
import { PbxResolvedField } from '../interfaces';

type BxEntityRecord = Record<string, unknown>;

/**
 * Pre-loaded context for a specific portal + entity type.
 * Caches resolved fields/categories/stages so business logic
 * doesn't need to hit the DB for each field lookup.
 */
export class PbxEntityContext {
    constructor(
        readonly portalId: bigint,
        readonly entityType: PbxEntityType,
        readonly entityDbId: bigint,
        private readonly fieldsByCode: Map<string, PbxResolvedField>,
        private readonly stagesByCatCode: Map<string, Map<string, string>>,
        private readonly categoryBitrixIds: Map<string, number>,
        private readonly registry: PbxRegistryService,
    ) {}

    /**
     * Get the full Bitrix field key (UF_CRM_...) for a field code.
     */
    fieldKey(code: string): string {
        const field = this.fieldsByCode.get(code);
        if (!field) return '';
        return `UF_CRM_${field.bitrixId}`;
    }

    /**
     * Get the camelCase Bitrix field key for a field code.
     * Used when reading from Bitrix API responses (which return camelCase keys).
     */
    fieldCamelKey(code: string): string {
        const field = this.fieldsByCode.get(code);
        return field?.bitrixCamelId ?? '';
    }

    /**
     * Get the raw bitrixId suffix for a field code.
     */
    fieldBitrixId(code: string): string {
        const field = this.fieldsByCode.get(code);
        return field?.bitrixId ?? '';
    }

    /**
     * Read a value from a Bitrix entity record by field code.
     */
    getValue<T = unknown>(record: BxEntityRecord, code: string): T | undefined {
        const key = this.fieldCamelKey(code);
        if (!key) return undefined;
        return record[key] as T | undefined;
    }

    /**
     * Set a value on a Bitrix entity record by field code (using the UF_CRM_* key).
     */
    setValue(record: BxEntityRecord, code: string, value: unknown): boolean {
        const key = this.fieldKey(code);
        if (!key) return false;
        record[key] = value;
        return true;
    }

    /**
     * Build a partial Bitrix entity update payload from a map of field codes -> values.
     */
    buildPayload(values: Record<string, unknown>): BxEntityRecord {
        const result: BxEntityRecord = {};
        for (const [code, value] of Object.entries(values)) {
            const key = this.fieldKey(code);
            if (key) {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Extract values from a Bitrix entity record into a map of field codes -> values.
     */
    extractValues(record: BxEntityRecord): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [code, field] of this.fieldsByCode) {
            const camelKey = field.bitrixCamelId;
            if (camelKey && camelKey in record) {
                result[code] = record[camelKey];
            }
        }
        return result;
    }

    /**
     * Resolve a field item code to its Bitrix ID (for enumeration fields).
     */
    itemBitrixId(fieldCode: string, itemCode: string): number | undefined {
        const field = this.fieldsByCode.get(fieldCode);
        if (!field) return undefined;

        const definition = field.definition;
        if (!definition.items) return undefined;

        const item = definition.items.find(i => i.code === itemCode);
        if (!item) return undefined;

        return this.lookupItemBitrixId(field.dbId, itemCode);
    }

    /**
     * Get the Bitrix category ID by category code.
     */
    categoryId(categoryCode: string): number | undefined {
        return this.categoryBitrixIds.get(categoryCode);
    }

    /**
     * Get the Bitrix stage (status) ID by category code + stage code.
     */
    stageId(categoryCode: string, stageCode: string): string | undefined {
        return this.stagesByCatCode.get(categoryCode)?.get(stageCode);
    }

    /**
     * Find stage ID across all categories (like PortalModel.getStageByCode).
     */
    stageIdByCode(stageCode: string): string | undefined {
        for (const stageMap of this.stagesByCatCode.values()) {
            const id = stageMap.get(stageCode);
            if (id) return id;
        }
        return undefined;
    }

    /**
     * Get all select keys (bitrixCamelId) for API SELECT parameter.
     */
    allSelectKeys(): string[] {
        const keys: string[] = [];
        for (const field of this.fieldsByCode.values()) {
            if (field.bitrixCamelId) {
                keys.push(field.bitrixCamelId);
            }
        }
        return keys;
    }

    /**
     * Check if a field code is registered for this entity.
     */
    hasField(code: string): boolean {
        return this.fieldsByCode.has(code);
    }

    /**
     * Get resolved field metadata.
     */
    getField(code: string): PbxResolvedField | undefined {
        return this.fieldsByCode.get(code);
    }

    private lookupItemBitrixId(
        fieldDbId: bigint,
        itemCode: string,
    ): number | undefined {
        void fieldDbId;
        void itemCode;
        return undefined;
    }
}

/**
 * Factory service for creating PbxEntityContext instances.
 * Business logic should inject this service and call `forEntity()` to get
 * a pre-loaded context for a specific portal + entity type.
 */
@Injectable()
export class PbxEntityAccessorService {
    private readonly logger = new Logger(PbxEntityAccessorService.name);

    constructor(
        private readonly resolver: PbxResolverService,
        private readonly registry: PbxRegistryService,
    ) {}

    /**
     * Create a context for a CRM entity (deal, lead, company, contact).
     * Loads all resolved fields, categories, and stages from the DB.
     */
    async forEntity(
        portalId: bigint,
        entityType: PbxEntityType,
        entityDbId: bigint,
    ): Promise<PbxEntityContext> {
        const fields = await this.resolver.resolveAllFields(
            entityDbId,
            entityType,
        );

        const categories = await this.resolver.resolveAllCategories(entityDbId);

        const stagesByCatCode = new Map<string, Map<string, string>>();
        const categoryBitrixIds = new Map<string, number>();

        for (const [catCode, cat] of categories) {
            categoryBitrixIds.set(catCode, cat.bitrixId);
            const stages = await this.resolver.resolveAllStages(cat.dbId);
            const stageMap = new Map<string, string>();
            for (const [stageCode, stage] of stages) {
                stageMap.set(stageCode, stage.bitrixId);
            }
            stagesByCatCode.set(catCode, stageMap);
        }

        return new PbxEntityContext(
            portalId,
            entityType,
            entityDbId,
            fields,
            stagesByCatCode,
            categoryBitrixIds,
            this.registry,
        );
    }

    /**
     * Create a context for a smart process.
     * Resolves the smart's entityTypeId, then loads its fields.
     */
    async forSmart(
        portalId: bigint,
        smartCode: string,
    ): Promise<PbxEntityContext | null> {
        const smart = await this.resolver.resolveSmartEntityTypeId(
            portalId,
            smartCode,
        );
        if (!smart) {
            this.logger.warn(
                `Smart process "${smartCode}" not found for portal ${portalId}`,
            );
            return null;
        }

        const smartRecord = await this.resolver.resolveAllSmarts(portalId);
        const smartResolved = smartRecord.get(smartCode);
        if (!smartResolved) return null;

        const fields = await this.resolver.resolveAllFields(
            smartResolved.dbId,
            PbxEntityType.SMART,
        );

        const categories = await this.resolver.resolveAllCategories(
            smartResolved.dbId,
        );

        const stagesByCatCode = new Map<string, Map<string, string>>();
        const categoryBitrixIds = new Map<string, number>();

        for (const [catCode, cat] of categories) {
            categoryBitrixIds.set(catCode, cat.bitrixId);
            const stages = await this.resolver.resolveAllStages(cat.dbId);
            const stageMap = new Map<string, string>();
            for (const [stageCode, stage] of stages) {
                stageMap.set(stageCode, stage.bitrixId);
            }
            stagesByCatCode.set(catCode, stageMap);
        }

        return new PbxEntityContext(
            portalId,
            PbxEntityType.SMART,
            smartResolved.dbId,
            fields,
            stagesByCatCode,
            categoryBitrixIds,
            this.registry,
        );
    }

    /**
     * Create a context for an RPA process.
     */
    async forRpa(
        portalId: bigint,
        rpaCode: string,
    ): Promise<PbxEntityContext | null> {
        const rpas = await this.resolver.resolveAllSmarts(portalId);
        const rpaResolved = rpas.get(rpaCode);
        if (!rpaResolved) {
            this.logger.warn(
                `RPA "${rpaCode}" not found for portal ${portalId}`,
            );
            return null;
        }

        const fields = await this.resolver.resolveAllFields(
            rpaResolved.dbId,
            PbxEntityType.BTX_RPA,
        );

        return new PbxEntityContext(
            portalId,
            PbxEntityType.BTX_RPA,
            rpaResolved.dbId,
            fields,
            new Map(),
            new Map(),
            this.registry,
        );
    }
}
