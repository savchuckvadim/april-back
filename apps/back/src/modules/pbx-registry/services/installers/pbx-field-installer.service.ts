import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PbxEntityType, getPrismaEntityTypeByType } from '@/shared/enums';
import { PbxRegistryService } from '../pbx-registry.service';
import { PbxFieldDefinition } from '../../interfaces';
import { BitrixService, IUserFieldConfig } from '@/modules/bitrix';

export interface FieldInstallResult {
    code: string;
    status: 'created' | 'exists' | 'error';
    bitrixId?: string;
    error?: string;
}

export interface FieldInstallOptions {
    portalId: bigint;
    entityType: PbxEntityType;
    entityDbId: bigint;
    group?: string;
    fieldCodes?: string[];
    withBitrixSync: boolean;
    smartEntityTypeId?: number;
}

@Injectable()
export class PbxFieldInstallerService {
    private readonly logger = new Logger(PbxFieldInstallerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: PbxRegistryService,
    ) {}

    /**
     * Install fields for a given entity type into the database (and optionally Bitrix).
     */
    async installFields(
        options: FieldInstallOptions,
        bitrixService?: BitrixService,
    ): Promise<FieldInstallResult[]> {
        const {
            entityType,
            entityDbId,
            group,
            fieldCodes,
            withBitrixSync,
            smartEntityTypeId,
        } = options;

        let fields = this.registry.getFieldsForEntity(entityType, group);

        if (fieldCodes?.length) {
            fields = fields.filter(f => fieldCodes.includes(f.code));
        }

        const results: FieldInstallResult[] = [];

        for (const fieldDef of fields) {
            try {
                const result = await this.installField(
                    fieldDef,
                    entityType,
                    entityDbId,
                    withBitrixSync,
                    smartEntityTypeId,
                    bitrixService,
                );
                results.push(result);
            } catch (error) {
                results.push({
                    code: fieldDef.code,
                    status: 'error',
                    error: (error as Error).message,
                });
            }
        }

        this.logger.log(
            `Installed ${results.filter(r => r.status === 'created').length} fields, ` +
                `${results.filter(r => r.status === 'exists').length} existed, ` +
                `${results.filter(r => r.status === 'error').length} errors`,
        );

        return results;
    }

    private async installField(
        fieldDef: PbxFieldDefinition,
        entityType: PbxEntityType,
        entityDbId: bigint,
        withBitrixSync: boolean,
        smartEntityTypeId?: number,
        bitrixService?: BitrixService,
    ): Promise<FieldInstallResult> {
        const prismaEntityType = getPrismaEntityTypeByType(entityType);
        const suffix = fieldDef.suffixes[entityType];

        if (!suffix) {
            return {
                code: fieldDef.code,
                status: 'error',
                error: 'No suffix for entity type',
            };
        }

        const existing = await this.prisma.bitrixfields.findFirst({
            where: {
                code: fieldDef.code,
                entity_id: entityDbId,
                entity_type: prismaEntityType,
            },
        });

        if (existing) {
            return {
                code: fieldDef.code,
                status: 'exists',
                bitrixId: existing.bitrixId,
            };
        }

        const bitrixFieldName = this.buildBitrixFieldName(
            entityType,
            suffix,
            smartEntityTypeId,
        );
        const bitrixCamelId = this.toBitrixCamelId(bitrixFieldName);

        let finalBitrixId = bitrixFieldName;

        if (withBitrixSync && bitrixService) {
            try {
                const bxResult = await this.createFieldInBitrix(
                    bitrixService,
                    entityType,
                    fieldDef,
                    bitrixFieldName,
                    smartEntityTypeId,
                );
                if (bxResult?.bitrixId) {
                    finalBitrixId = bxResult.bitrixId;
                }
            } catch (error) {
                this.logger.warn(
                    `Bitrix sync failed for field ${fieldDef.code}: ${(error as Error).message}`,
                );
            }
        }

        const isMultipleType =
            fieldDef.isMultiple || fieldDef.type === 'multiple'
                ? 'string'
                : fieldDef.type;

        const dbField = await this.prisma.bitrixfields.create({
            data: {
                code: fieldDef.code,
                name: fieldDef.name,
                title: fieldDef.name,
                type: isMultipleType,
                bitrixId: finalBitrixId,
                bitrixCamelId,
                entity_id: entityDbId,
                entity_type: prismaEntityType,
                parent_type: entityType,
            },
        });

        if (fieldDef.items?.length) {
            await this.installFieldItems(dbField.id, fieldDef);
        }

        return {
            code: fieldDef.code,
            status: 'created',
            bitrixId: finalBitrixId,
        };
    }

    private async installFieldItems(
        fieldDbId: bigint,
        fieldDef: PbxFieldDefinition,
    ): Promise<void> {
        if (!fieldDef.items?.length) return;

        for (const item of fieldDef.items) {
            await this.prisma.bitrixfield_items.create({
                data: {
                    bitrixfield_id: fieldDbId,
                    code: item.code,
                    name: item.value,
                    title: item.value,
                    bitrixId: 0,
                },
            });
        }
    }

    private async createFieldInBitrix(
        bitrixService: BitrixService,
        entityType: PbxEntityType,
        fieldDef: PbxFieldDefinition,
        bitrixFieldName: string,
        smartEntityTypeId?: number,
    ): Promise<{ bitrixId: string } | null> {
        const fieldData: Record<string, any> = {
            FIELD_NAME: bitrixFieldName,
            USER_TYPE_ID: this.mapFieldType(fieldDef.type),
            EDIT_FORM_LABEL: { ru: fieldDef.name },
            LIST_COLUMN_LABEL: { ru: fieldDef.name },
            MULTIPLE: fieldDef.isMultiple ? 'Y' : 'N',
            SORT: fieldDef.order ?? 100,
        };

        if (fieldDef.items?.length) {
            fieldData.LIST = fieldDef.items.map((item, idx) => ({
                VALUE: item.value,
                SORT: item.sort ?? (idx + 1) * 10,
                XML_ID: item.xmlId ?? item.code,
                DEF: 'N',
            }));
        }

        if (entityType === PbxEntityType.SMART && smartEntityTypeId) {
            fieldData.ENTITY_ID = `CRM_${smartEntityTypeId}`;
        } else {
            const entityIdMap: Partial<Record<PbxEntityType, string>> = {
                [PbxEntityType.DEAL]: 'CRM_DEAL',
                [PbxEntityType.LEAD]: 'CRM_LEAD',
                [PbxEntityType.BTX_COMPANY]: 'CRM_COMPANY',
                [PbxEntityType.BTX_CONTACT]: 'CRM_CONTACT',
            };
            fieldData.ENTITY_ID = entityIdMap[entityType] ?? 'CRM_DEAL';
        }

        switch (entityType) {
            case PbxEntityType.DEAL:
                await bitrixService.deal.setField(fieldData);
                break;
            case PbxEntityType.LEAD:
                await bitrixService.lead.addField(fieldData);
                break;
            case PbxEntityType.BTX_COMPANY:
                await bitrixService.company.addField(fieldData);
                break;
            case PbxEntityType.BTX_CONTACT:
                await bitrixService.contact.addField(fieldData);
                break;
            default:
                await bitrixService.userFieldConfig.add({
                    moduleId: 'crm',
                    field: fieldData as Partial<IUserFieldConfig>,
                });
                break;
        }

        return { bitrixId: bitrixFieldName };
    }

    private buildBitrixFieldName(
        entityType: PbxEntityType,
        suffix: string,
        smartEntityTypeId?: number,
    ): string {
        if (
            (entityType === PbxEntityType.SMART ||
                entityType === PbxEntityType.BTX_RPA) &&
            smartEntityTypeId
        ) {
            return `UF_CRM_${smartEntityTypeId}_${suffix}`;
        }
        return `UF_CRM_${suffix}`;
    }

    private toBitrixCamelId(bitrixId: string): string {
        return bitrixId
            .replace(/^UF_CRM_/, 'ufCrm')
            .replace(/_([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
    }

    private mapFieldType(type: string): string {
        const typeMap: Record<string, string> = {
            string: 'string',
            integer: 'integer',
            double: 'double',
            date: 'date',
            datetime: 'datetime',
            boolean: 'boolean',
            money: 'money',
            enumeration: 'enumeration',
            employee: 'employee',
            crm: 'crm',
            file: 'file',
            url: 'url',
            multiple: 'string',
        };
        return typeMap[type] ?? type;
    }
}
