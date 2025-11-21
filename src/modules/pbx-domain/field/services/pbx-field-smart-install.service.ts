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

type FieldGroup = 'sales' | 'service';
type AppType = 'event' | 'konstructor';

interface InstallResult {
    success: string[];
    failed: string[];
}

interface InstallOptions {
    entityTypeIds?: number[];
    fieldCodes?: (PbxSalesEventFieldCode | PbxSalesKonstructorFieldCode)[];
}

@Injectable()
export class PbxFieldSmartInstallService {
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

        // Получаем smart сущности из портала
        const smartEntities = portal?.smarts?.filter(s => s.group === group) || [];

        // Фильтруем по entityTypeIds, если указаны
        const entitiesToProcess = options.entityTypeIds
            ? smartEntities.filter(s => options.entityTypeIds!.includes(s.entityTypeId))
            : smartEntities;

        if (entitiesToProcess.length === 0) {
            return { success: [], failed: [] };
        }

        const results: InstallResult = { success: [], failed: [] };

        // Устанавливаем поля для каждой smart сущности
        for (const field of filteredFields) {
            for (const smartEntity of entitiesToProcess) {
                const fieldResults = await this.installFieldForSmart(
                    bitrix,
                    portal,
                    field,
                    appType,
                    smartEntity.entityTypeId,
                );
                results.success.push(...fieldResults.success);
                results.failed.push(...fieldResults.failed);
            }
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
                entitiesToProcess.map(s => s.entityTypeId),
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
            entitiesToProcess.map(s => s.entityTypeId),
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

    private async installFieldForSmart(
        bitrix: BitrixService,
        portal: IPortal,
        field: PbxSalesEventField | PbxSalesKonstructorField,
        appType: AppType,
        entityTypeId: number,
    ): Promise<InstallResult> {
        const results: InstallResult = { success: [], failed: [] };
        const itemKey = appType === 'event' ? 'items' : 'list';

        const bitrixFieldId = this.getBitrixFieldId(field, 'smart');
        if (!bitrixFieldId) {
            results.failed.push(field.code);
            return results;
        }

        try {
            const bitrixEntityId = `CRM_${entityTypeId}`;

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
                    return results;
                }
            }

            // Сохраняем в DB
            await this.saveFieldToDb(
                field,
                bitrixFieldId,
                itemKey,
                BigInt(entityTypeId),
            );

            results.success.push(field.code);
        } catch (error) {
            console.error(
                `Failed to install field ${field.code} for smart entity ${entityTypeId}:`,
                error,
            );
            results.failed.push(field.code);
        }

        return results;
    }

    private async findFieldInBitrix(
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

    private mapFieldTypeToBitrixType(type: string): EUserFieldType {
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

    private async saveFieldToDb(
        field: PbxSalesEventField | PbxSalesKonstructorField,
        bitrixFieldId: string | number,
        itemKey: 'items' | 'list',
        entityId: bigint,
    ): Promise<void> {
        const bitrixFieldIdStr = `UF_CRM_${bitrixFieldId}`;

        const fieldEntity = new PbxFieldEntity();
        fieldEntity.name = field.name;
        fieldEntity.title = field.name;
        fieldEntity.code = field.code;
        fieldEntity.type = this.mapFieldTypeToBitrixType(field.type);
        fieldEntity.bitrixId = bitrixFieldIdStr;
        fieldEntity.bitrixCamelId = '';
        fieldEntity.entity_id = entityId;
        fieldEntity.entity_type = PbxFieldEntityType.SMART;
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
        entityTypeIds: number[],
    ): Promise<InstallResult> {
        const results: InstallResult = { success: [], failed: [] };

        for (const code of failedCodes) {
            const field = fields.find(f => f.code === code);
            if (!field) {
                results.failed.push(code);
                continue;
            }

            let allSuccess = true;
            for (const entityTypeId of entityTypeIds) {
                const fieldResults = await this.installFieldForSmart(
                    bitrix,
                    portal,
                    field,
                    appType,
                    entityTypeId,
                );

                if (fieldResults.failed.length > 0) {
                    allSuccess = false;
                }
            }

            if (allSuccess) {
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
        entityTypeIds: number[],
    ): Promise<{ verified: string[]; failed: string[] }> {
        const verified: string[] = [];
        const failed: string[] = [];

        for (const code of successCodes) {
            const field = fields.find(f => f.code === code);
            if (!field) {
                failed.push(code);
                continue;
            }

            const bitrixFieldId = this.getBitrixFieldId(field, 'smart');
            if (!bitrixFieldId) {
                failed.push(code);
                continue;
            }

            let isVerified = true;
            for (const entityTypeId of entityTypeIds) {
                const bitrixEntityId = `CRM_${entityTypeId}`;
                const existingField = await this.findFieldInBitrix(
                    bitrix,
                    bitrixEntityId,
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

