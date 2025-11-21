import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { PbxFieldService } from '../pbx-field.service';
import {
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
    EUserFieldType,
} from '@/modules/bitrix/domain/userfieldconfig/interface/userfieldconfig.interface';
import { BitrixService } from '@/modules/bitrix/bitrix.service';
import {
    PBX_SALES_EVENT_FIELDS,
    PbxSalesEventField,
} from '../type/sales/event/pbx-sales-event-field.type';
import {
    PBX_SALES_KONSTRUCTOR_FIELDS,
    PbxSalesKonstructorField,
} from '../type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PbxFieldEntity, PbxFieldEntityType } from '../pbx-field.entity';
import { delay } from '@/lib';
import { IPortal } from '@/modules/portal/interfaces/portal.interface';

type FieldGroup = 'sales' | 'service';
type AppType = 'event' | 'konstructor';

interface InstallResult {
    success: string[];
    failed: string[];
}

@Injectable()
export class PbxFieldInstallService {
    constructor(
        private readonly pbxFieldService: PbxFieldService,
        private readonly pbxService: PBXService,
    ) { }

    async install(
        domain: string,
        group: FieldGroup,
        appType: AppType,
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

        const results: InstallResult = { success: [], failed: [] };

        // Устанавливаем поля для каждой сущности
        for (const field of fields) {
            const fieldResults = await this.installFieldForEntities(
                bitrix,
                portal,
                field,
                appType,
                group,
            );
            results.success.push(...fieldResults.success);
            results.failed.push(...fieldResults.failed);
        }

        // Проверяем установленные поля и повторяем попытки для неудачных
        if (results.failed.length > 0) {
            await delay(2000); // Задержка 2 секунды

            const retryResults = await this.retryFailedFields(
                bitrix,
                portal,
                results.failed,
                fields as (PbxSalesEventField | PbxSalesKonstructorField)[],
                appType,
                group,
            );
            results.success.push(...retryResults.success);
            results.failed = retryResults.failed;
        }

        // Финальная проверка: получаем все поля из Bitrix и проверяем, что все установлены
        const verificationResults = await this.verifyInstalledFields(
            bitrix,
            results.success,
            fields as (PbxSalesEventField | PbxSalesKonstructorField)[],
            appType,
        );

        // Удаляем из success те, которые не прошли проверку
        results.success = results.success.filter(
            code => verificationResults.verified.includes(code),
        );
        // Добавляем в failed те, которые не прошли проверку
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
    ): Promise<InstallResult> {
        const results: InstallResult = { success: [], failed: [] };
        const itemKey = appType === 'event' ? 'items' : 'list';

        // Обрабатываем каждую сущность (lead, company, deal, smart)
        const entities = [
            { key: 'lead' as const, entityId: 'CRM_LEAD' as const, dbEntityId: BigInt(1) },
            { key: 'company' as const, entityId: 'CRM_COMPANY' as const, dbEntityId: BigInt(4) },
            { key: 'deal' as const, entityId: 'CRM_DEAL' as const, dbEntityId: BigInt(2) },
        ];

        for (const entity of entities) {
            const bitrixFieldId = this.getBitrixFieldId(field, entity.key);
            if (!bitrixFieldId) continue;

            try {
                const entityTypeId = this.getEntityTypeId(portal, field, entity.key, group);
                const bitrixEntityId = entityTypeId
                    ? `CRM_${entityTypeId}`
                    : entity.entityId;
                const dbEntityId = entityTypeId ? BigInt(entityTypeId) : entity.dbEntityId;

                // Проверяем существование поля в Bitrix
                const existingField = await this.findFieldInBitrix(
                    bitrix,
                    bitrixEntityId,
                    bitrixFieldId,
                );

                // Создаем конфигурацию поля
                const fieldConfig = this.createFieldConfig(
                    field,
                    bitrixEntityId,
                    bitrixFieldId,
                    itemKey,
                );

                if (existingField?.id) {
                    // Обновляем существующее поле
                    await bitrix.userFieldConfig.update({
                        moduleId: 'crm',
                        id: existingField.id,
                        field: fieldConfig,
                    });
                } else {
                    // Создаем новое поле
                    const response = await bitrix.userFieldConfig.add({
                        moduleId: 'crm',
                        field: fieldConfig,
                    });

                    if (!response?.result?.field?.id) {
                        results.failed.push(field.code);
                        continue;
                    }
                }

                // Сохраняем в DB
                await this.saveFieldToDb(
                    field,
                    entity.key,
                    bitrixFieldId,
                    itemKey,
                    dbEntityId,
                );

                results.success.push(field.code);
            } catch (error) {
                console.error(
                    `Failed to install field ${field.code} for ${entity.key}:`,
                    error,
                );
                results.failed.push(field.code);
            }
        }

        return results;
    }

    private async findFieldInBitrix(
        bitrix: BitrixService,
        entityId: string,
        bitrixFieldId: string | number,
    ): Promise<IUserFieldConfig | null> {
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
    ): Partial<IUserFieldConfig> {
        const fieldName = `UF_CRM_${bitrixFieldId}`;
        const userTypeId = this.mapFieldTypeToBitrixType(field.type);
        const items = (field[itemKey] || []) as Array<{
            value?: string;
            code: string;
            sort?: number;
            xml_id?: string;
        }>;

        const config: Partial<IUserFieldConfig> = {
            entityId: entityId as IUserFieldConfig['entityId'],
            fieldName,
            userTypeId,
            multiple: field.isMultiple ? 'Y' : 'N',
            mandatory: 'N',
            showFilter: 'Y',
            showInList: 'Y',
            isSearchable: 'N',
            languageId: {
                ru: field.name,
            },
            editFormLabel: {
                ru: field.name,
            },
            listColumnLabel: {
                ru: field.name,
            },
        };

        // Добавляем enum значения если есть
        if (userTypeId === EUserFieldType.ENUMERATION && items.length > 0) {
            config.enum = items.map((item, index) => ({
                value: item.value || item.code,
                def: 'N' as const,
                sort: item.sort || (index + 1) * 10,
                xmlId: item.xml_id || item.code,
            }));
        }

        return config;
    }

    private mapFieldTypeToBitrixType(
        type: string,
    ): EUserFieldType {
        const typeMap: Record<string, EUserFieldType> = {
            string: EUserFieldType.STRING,
            integer: EUserFieldType.INTEGER,
            double: EUserFieldType.DOUBLE,
            datetime: EUserFieldType.DATETIME,
            date: EUserFieldType.DATE,
            boolean: EUserFieldType.BOOLEAN,
            enumeration: EUserFieldType.ENUMERATION,
            employee: EUserFieldType.EMPLOYEE,
            multiple: EUserFieldType.ENUMERATION,
            money: EUserFieldType.MONEY,
        };

        return typeMap[type] || EUserFieldType.STRING;
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

    private getEntityTypeId(
        portal: IPortal,
        field: PbxSalesEventField | PbxSalesKonstructorField,
        entityKey: 'lead' | 'company' | 'deal' | 'smart',
        group: FieldGroup,
    ): number | null {
        // Для обычных сущностей (lead, company, deal) возвращаем null
        // Для smart сущностей нужно получить entityTypeId из портала
        if (entityKey === 'smart' && portal?.smarts) {
            // Ищем smart сущность по group (например, 'sales')
            const smart = portal.smarts.find(s => s.group === group);
            return smart?.entityTypeId || null;
        }
        return null;
    }

    private async saveFieldToDb(
        field: PbxSalesEventField | PbxSalesKonstructorField,
        entityKey: 'lead' | 'company' | 'deal' | 'smart',
        bitrixFieldId: string | number,
        itemKey: 'items' | 'list',
        entityId: bigint,
    ): Promise<void> {
        const bitrixFieldIdStr = `UF_CRM_${bitrixFieldId}`;
        const entityType = this.mapEntityKeyToEntityType(entityKey);

        const fieldEntity = new PbxFieldEntity();
        fieldEntity.name = field.name;
        fieldEntity.title = field.name;
        fieldEntity.code = field.code;
        fieldEntity.type = this.mapFieldTypeToBitrixType(field.type);
        fieldEntity.bitrixId = bitrixFieldIdStr;
        fieldEntity.bitrixCamelId = '';
        fieldEntity.entity_id = entityId;
        fieldEntity.entity_type = entityType;
        fieldEntity.parent_type = '';
        fieldEntity.isPlural = field.isMultiple;
        fieldEntity.items = ((field[itemKey] || []) as Array<{
            code: string;
            name?: string;
            title?: string;
            bitrixId?: string | number;
        }>).map(item => {
            const itemEntity = {
                name: item.name || item.code,
                title: item.title || item.code,
                code: item.code,
                bitrixId: typeof item.bitrixId === 'number'
                    ? item.bitrixId
                    : parseInt(item.bitrixId || '0', 10),
                bitrixfield_id: BigInt(0), // Будет установлено при сохранении
            };
            return itemEntity;
        });

        await this.pbxFieldService.upsertFields([fieldEntity]);
    }

    private mapEntityKeyToEntityType(
        entityKey: 'lead' | 'company' | 'deal' | 'smart',
    ): PbxFieldEntityType {
        const map: Record<string, PbxFieldEntityType> = {
            lead: PbxFieldEntityType.LEAD,
            company: PbxFieldEntityType.COMPANY,
            deal: PbxFieldEntityType.DEAL,
            smart: PbxFieldEntityType.SMART,
        };
        return map[entityKey] || PbxFieldEntityType.SMART;
    }

    private async retryFailedFields(
        bitrix: BitrixService,
        portal: IPortal,
        failedCodes: string[],
        fields: (PbxSalesEventField | PbxSalesKonstructorField)[],
        appType: AppType,
        group: FieldGroup,
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
    ): Promise<{ verified: string[]; failed: string[] }> {
        const verified: string[] = [];
        const failed: string[] = [];
        const itemKey = appType === 'event' ? 'items' : 'list';

        const entities = [
            { key: 'lead' as const, entityId: 'CRM_LEAD' as const },
            { key: 'company' as const, entityId: 'CRM_COMPANY' as const },
            { key: 'deal' as const, entityId: 'CRM_DEAL' as const },
        ];

        for (const code of successCodes) {
            const field = fields.find(f => f.code === code);
            if (!field) {
                failed.push(code);
                continue;
            }

            let isVerified = true;
            for (const entity of entities) {
                const bitrixFieldId = this.getBitrixFieldId(field, entity.key);
                if (!bitrixFieldId) continue;

                const existingField = await this.findFieldInBitrix(
                    bitrix,
                    entity.entityId,
                    bitrixFieldId,
                );

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
