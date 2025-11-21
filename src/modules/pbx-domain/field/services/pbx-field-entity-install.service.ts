import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { PbxFieldService } from '../pbx-field.service';
import { BitrixService } from '@/modules/bitrix/bitrix.service';
import {
    PBX_SALES_EVENT_FIELDS,
    PbxSalesEventField,
    PbxSalesEventFieldCode,
} from '../type/sales/event/pbx-sales-event-field.type';
import {
    PBX_SALES_KONSTRUCTOR_FIELDS,
    PbxSalesKonstructorField,
    PbxSalesKonstructorFieldCode,
} from '../type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PbxFieldEntity, PbxFieldEntityType } from '../pbx-field.entity';
import { delay } from '@/lib';
import { IPortal } from '@/modules/portal/interfaces/portal.interface';
import { IBXField } from '@/modules/bitrix/domain/crm/fields/bx-field.interface';

type FieldGroup = 'sales' | 'service';
type AppType = 'event' | 'konstructor';

interface InstallResult {
    success: string[];
    failed: string[];
}

interface InstallOptions {
    entities?: PbxFieldEntityType[];
    fieldCodes?: (PbxSalesEventFieldCode | PbxSalesKonstructorFieldCode)[];
}

@Injectable()
export class PbxFieldEntityInstallService {
    constructor(
        private readonly pbxFieldService: PbxFieldService,
        private readonly pbxService: PBXService,
    ) { }

    async install(
        domain: string,
        group: FieldGroup,
        appType: AppType,
        options: InstallOptions = {},
    ): Promise<InstallResult> {
        const { bitrix, portal } = await this.pbxService.init(domain);

        // Получаем поля в зависимости от group и appType
        const fields: readonly (PbxSalesEventField | PbxSalesKonstructorField)[] =
            group === 'sales' && appType === 'event'
                ? PBX_SALES_EVENT_FIELDS
                : group === 'sales' && appType === 'konstructor'
                    ? PBX_SALES_KONSTRUCTOR_FIELDS
                    : [];

        if (fields.length === 0) {
            return { success: [], failed: [] };
        }

        // Фильтруем поля по fieldCodes, если указаны
        // TypeScript гарантирует, что коды типизированы правильно
        const filteredFields = options.fieldCodes
            ? fields.filter(f =>
                options.fieldCodes!.includes(
                    f.code as PbxSalesEventFieldCode | PbxSalesKonstructorFieldCode,
                ),
            )
            : fields;

        const results: InstallResult = { success: [], failed: [] };

        // Определяем, какие сущности обрабатывать
        const entitiesToProcess: PbxFieldEntityType[] = (options.entities && options.entities.length) ? options.entities : [
            PbxFieldEntityType.LEAD,
            PbxFieldEntityType.COMPANY,
            PbxFieldEntityType.DEAL,
        ];

        // Устанавливаем поля для каждой сущности
        for (const field of filteredFields) {
            const fieldResults = await this.installFieldForEntities(
                bitrix,
                portal,
                field,
                appType,
                group,
                entitiesToProcess,
            );
            results.success.push(...fieldResults.success);
            results.failed.push(...fieldResults.failed);
        }

        // Проверяем установленные поля и повторяем попытки для неудачных
        if (results.failed.length > 0) {
            await delay(2000);

            const retryResults = await this.retryFailedFields(
                bitrix,
                portal,
                results.failed,
                filteredFields as (PbxSalesEventField | PbxSalesKonstructorField)[],
                appType,
                group,
                entitiesToProcess,
            );
            results.success.push(...retryResults.success);
            results.failed = retryResults.failed;
        }

        // Финальная проверка
        const verificationResults = await this.verifyInstalledFields(
            bitrix,
            results.success,
            filteredFields as (PbxSalesEventField | PbxSalesKonstructorField)[],
            appType,
            entitiesToProcess,
        );

        results.success = results.success.filter(
            code => verificationResults.verified.includes(code),
        );
        results.failed.push(
            ...verificationResults.failed.filter(
                code => !results.failed.includes(code),
            ),
        );

        return results;
    }

    private async installFieldForEntities(
        bitrix: BitrixService,
        portal: IPortal,
        field: PbxSalesEventField | PbxSalesKonstructorField,
        appType: AppType,
        group: FieldGroup,
        entitiesToProcess: PbxFieldEntityType[],
    ): Promise<InstallResult> {
        const results: InstallResult = { success: [], failed: [] };
        const itemKey = appType === 'event' ? 'items' : 'list';

        // Маппинг сущностей на методы Bitrix и entityId для БД
        const entityMap = {
            [PbxFieldEntityType.LEAD]: {
                service: null, // lead не имеет методов для работы с полями в Bitrix API
                entityId: 'CRM_LEAD',
                dbEntityId: BigInt(1),//переделать брать id сущности а не  хардеодить как сейчас
                useUserFieldConfig: true, // используем userFieldConfig для lead
            },
            [PbxFieldEntityType.COMPANY]: {
                service: bitrix.company,
                entityId: 'CRM_COMPANY',
                dbEntityId: BigInt(4),//переделать брать id сущности а не  хардеодить как сейчас
                useUserFieldConfig: false,
            },
            [PbxFieldEntityType.DEAL]: {
                service: bitrix.deal,
                entityId: 'CRM_DEAL',
                dbEntityId: BigInt(2),//переделать брать id сущности а не  хардеодить как сейчас
                useUserFieldConfig: false,
            },
        };

        for (const entityType of entitiesToProcess) {
            const entityConfig = entityMap[entityType];
            if (!entityConfig) continue;

            const bitrixFieldId = this.getBitrixFieldId(field, this.getEntityKey(entityType));
            if (!bitrixFieldId) continue;

            try {
                // Создаем конфигурацию поля
                const fieldConfig = this.createFieldConfig(
                    field,
                    entityConfig.entityId,
                    bitrixFieldId,
                    itemKey,
                );

                let existingField: any = null;

                if (entityConfig.useUserFieldConfig) {
                    // Для lead используем userFieldConfig
                    existingField = await this.findFieldInBitrixViaUserFieldConfig(
                        bitrix,
                        entityConfig.entityId,
                        bitrixFieldId,
                    );
                } else {
                    // Для company и deal используем методы сущностей
                    existingField = await this.findFieldInBitrix(
                        entityConfig.service,
                        bitrixFieldId,
                    );
                }

                if (existingField) {
                    // Обновляем существующее поле
                    if (entityConfig.useUserFieldConfig) {
                        await bitrix.userFieldConfig.update({
                            moduleId: 'crm',
                            id: existingField.id,
                            field: this.convertToUserFieldConfig(fieldConfig),
                        });
                    } else {
                        // Для обновления используем userFieldConfig (так как нет метода update в entity service)
                        await bitrix.userFieldConfig.update({
                            moduleId: 'crm',
                            id: existingField.ID,
                            field: this.convertToUserFieldConfig(fieldConfig),
                        });
                    }
                } else {
                    // Создаем новое поле
                    if (entityConfig.useUserFieldConfig || !entityConfig.service?.addField) {
                        // Используем userFieldConfig для lead или если нет метода addField
                        const response = await bitrix.userFieldConfig.add({
                            moduleId: 'crm',
                            field: this.convertToUserFieldConfig(fieldConfig),
                        });

                        if (!response?.result?.field?.id) {
                            results.failed.push(field.code);
                            continue;
                        }
                    } else {
                        // Используем метод сущности для company
                        await entityConfig.service.addField(fieldConfig);
                    }
                }

                // Сохраняем в DB
                await this.saveFieldToDb(
                    field,
                    entityType,
                    bitrixFieldId,
                    itemKey,
                    entityConfig.dbEntityId,//переделать брать id сущности а не  хардеодить как сейчас
                );

                results.success.push(field.code);
            } catch (error) {
                console.error(
                    `Failed to install field ${field.code} for ${entityType}:`,
                    error,
                );
                results.failed.push(field.code);
            }
        }

        return results;
    }

    private async findFieldInBitrix(
        service: any,
        bitrixFieldId: string | number,
    ): Promise<IBXField | null> {
        try {
            if (!service?.getFieldsList) {
                return null;
            }

            const response = await service.getFieldsList({});
            const fields = response?.result || [];
            const fieldName = `UF_CRM_${bitrixFieldId}`;

            return fields.find((f: IBXField) => f.FIELD_NAME === fieldName) || null;
        } catch (error) {
            return null;
        }
    }

    private async findFieldInBitrixViaUserFieldConfig(
        bitrix: BitrixService,
        entityId: string,
        bitrixFieldId: string | number,
    ) {
        try {
            const response = await bitrix.userFieldConfig.list({
                moduleId: 'crm',
                filter: {
                    entityId,
                    fieldName: `UF_CRM_${bitrixFieldId}`,
                },
            });

            const fields = (response?.result as any)?.fields;
            return fields?.[0] || null;
        } catch (error) {
            return null;
        }
    }

    private createFieldConfig(
        field: PbxSalesEventField | PbxSalesKonstructorField,
        entityId: string,
        bitrixFieldId: string | number,
        itemKey: 'items' | 'list',
    ): Partial<IBXField> {
        const fieldName = `UF_CRM_${bitrixFieldId}`;
        const items = (field[itemKey] || []) as Array<{
            value?: string;
            code: string;
            sort?: number;
            xml_id?: string;
        }>;

        const config: Partial<IBXField> = {
            ENTITY_ID: entityId,
            FIELD_NAME: fieldName,
            USER_TYPE_ID: this.mapFieldTypeToBitrixType(field.type),
            MULTIPLE: field.isMultiple ? 'Y' : 'N',
            MANDATORY: 'N',
            SHOW_FILTER: 'Y',
            SHOW_IN_LIST: 'Y',
            EDIT_IN_LIST: 'Y',
            IS_SEARCHABLE: 'N',
            EDIT_FORM_LABEL: {
                ru: field.name,
            },
            LIST_COLUMN_LABEL: {
                ru: field.name,
            },
            XML_ID: field.code,
        };

        // Добавляем enum значения если есть
        if (config.USER_TYPE_ID === 'enumeration' && items.length > 0) {
            config.LIST = items.map((item, index) => ({
                ID: item.code,
                SORT: String(item.sort || (index + 1) * 10),
                VALUE: item.value || item.code,
                DEF: 'N' as const,
            }));
        }

        return config;
    }

    private convertToUserFieldConfig(field: Partial<IBXField>): any {
        return {
            entityId: field.ENTITY_ID,
            fieldName: field.FIELD_NAME,
            userTypeId: field.USER_TYPE_ID,
            multiple: field.MULTIPLE,
            mandatory: field.MANDATORY,
            showFilter: field.SHOW_FILTER,
            showInList: field.SHOW_IN_LIST,
            editInList: field.EDIT_IN_LIST,
            isSearchable: field.IS_SEARCHABLE,
            xmlId: field.XML_ID,
            editFormLabel: field.EDIT_FORM_LABEL,
            listColumnLabel: field.LIST_COLUMN_LABEL,
            enum: field.LIST?.map(item => ({
                value: item.VALUE,
                def: item.DEF,
                sort: parseInt(item.SORT, 10),
                xmlId: item.ID,
            })),
        };
    }

    private mapFieldTypeToBitrixType(type: string): string {
        const typeMap: Record<string, string> = {
            string: 'string',
            integer: 'integer',
            double: 'double',
            datetime: 'datetime',
            date: 'date',
            boolean: 'boolean',
            enumeration: 'enumeration',
            employee: 'employee',
            multiple: 'enumeration',
            money: 'money',
        };

        return typeMap[type] || 'string';
    }

    private getBitrixFieldId(
        field: PbxSalesEventField | PbxSalesKonstructorField,
        entityKey: 'lead' | 'company' | 'deal' | 'smart',
    ): string | number | null {
        const value = field[entityKey];
        if (!value) return null;
        if (typeof value === 'string' && value.trim() === '') return null;
        return typeof value === 'number' ? value : value;
    }

    private getEntityKey(entityType: PbxFieldEntityType): 'lead' | 'company' | 'deal' | 'smart' {
        const map: Record<PbxFieldEntityType, 'lead' | 'company' | 'deal' | 'smart'> = {
            [PbxFieldEntityType.LEAD]: 'lead',
            [PbxFieldEntityType.COMPANY]: 'company',
            [PbxFieldEntityType.DEAL]: 'deal',
            [PbxFieldEntityType.CONTACT]: 'lead', // fallback
            [PbxFieldEntityType.SMART]: 'smart',
        };
        return map[entityType] || 'lead';
    }

    private async saveFieldToDb(
        field: PbxSalesEventField | PbxSalesKonstructorField,
        entityType: PbxFieldEntityType,
        bitrixFieldId: string | number,
        itemKey: 'items' | 'list',
        entityId: bigint,//переделать брать id сущности а не  хардеодить как сейчас
    ): Promise<void> {
        const bitrixFieldIdStr = `UF_CRM_${bitrixFieldId}`;

        const fieldEntity = new PbxFieldEntity();
        fieldEntity.name = field.name;
        fieldEntity.title = field.name;
        fieldEntity.code = field.code;
        fieldEntity.type = this.mapFieldTypeToBitrixType(field.type) as any;
        fieldEntity.bitrixId = bitrixFieldIdStr;
        fieldEntity.bitrixCamelId = '';
        fieldEntity.entity_id = entityId; //переделать брать id сущности а не  хардеодить как сейчас
        fieldEntity.entity_type = entityType;
        fieldEntity.parent_type = '';
        fieldEntity.isPlural = field.isMultiple;
        fieldEntity.items = ((field[itemKey] || []) as Array<{
            code: string;
            name?: string;
            title?: string;
            bitrixId?: string | number;
        }>).map(item => ({
            name: item.name || item.code,
            title: item.title || item.code,
            code: item.code,
            bitrixId: typeof item.bitrixId === 'number'
                ? item.bitrixId
                : parseInt(item.bitrixId || '0', 10),
            bitrixfield_id: BigInt(0),
        }));

        await this.pbxFieldService.upsertFields([fieldEntity]);
    }

    private async retryFailedFields(
        bitrix: BitrixService,
        portal: IPortal,
        failedCodes: string[],
        fields: (PbxSalesEventField | PbxSalesKonstructorField)[],
        appType: AppType,
        group: FieldGroup,
        entitiesToProcess: PbxFieldEntityType[],
    ): Promise<InstallResult> {
        const results: InstallResult = { success: [], failed: [] };

        for (const code of failedCodes) {
            const field = fields.find(f => f.code === code);
            if (!field) {
                results.failed.push(code);
                continue;
            }

            const fieldResults = await this.installFieldForEntities(
                bitrix,
                portal,
                field,
                appType,
                group,
                entitiesToProcess,
            );

            if (fieldResults.failed.length === 0) {
                results.success.push(code);
            } else {
                results.failed.push(code);
            }
        }

        return results;
    }

    private async verifyInstalledFields(
        bitrix: BitrixService,
        successCodes: string[],
        fields: (PbxSalesEventField | PbxSalesKonstructorField)[],
        appType: AppType,
        entitiesToProcess: PbxFieldEntityType[],
    ): Promise<{ verified: string[]; failed: string[] }> {
        const verified: string[] = [];
        const failed: string[] = [];

        const entityMap = {
            [PbxFieldEntityType.LEAD]: {
                service: null,
                entityId: 'CRM_LEAD',
                useUserFieldConfig: true,
            },
            [PbxFieldEntityType.COMPANY]: {
                service: bitrix.company,
                entityId: 'CRM_COMPANY',
                useUserFieldConfig: false,
            },
            [PbxFieldEntityType.DEAL]: {
                service: bitrix.deal,
                entityId: 'CRM_DEAL',
                useUserFieldConfig: false,
            },
        };

        for (const code of successCodes) {
            const field = fields.find(f => f.code === code);
            if (!field) {
                failed.push(code);
                continue;
            }

            let isVerified = true;
            for (const entityType of entitiesToProcess) {
                const entityConfig = entityMap[entityType];
                if (!entityConfig) continue;

                const bitrixFieldId = this.getBitrixFieldId(field, this.getEntityKey(entityType));
                if (!bitrixFieldId) continue;

                let existingField: any = null;
                if (entityConfig.useUserFieldConfig) {
                    existingField = await this.findFieldInBitrixViaUserFieldConfig(
                        bitrix,
                        entityConfig.entityId,
                        bitrixFieldId,
                    );
                } else {
                    existingField = await this.findFieldInBitrix(
                        entityConfig.service,
                        bitrixFieldId,
                    );
                }

                if (!existingField) {
                    isVerified = false;
                    break;
                }
            }

            if (isVerified) {
                verified.push(code);
            } else {
                failed.push(code);
            }
        }

        return { verified, failed };
    }
}

