import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import { mapFieldTypeToBitrixType } from '@lib/portal-lib/pbx-domain';
import {
    EUserFieldType,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';
import {
    buildCallReportUfName,
    CALL_REPORT_SMART_CODE,
    CALL_REPORT_SMART_FIELDS,
    CALL_REPORT_SMART_TITLE,
    CallReportSmartFieldDef,
} from '../config/call-report-smart.config';
import { CallReportSmartResolverService } from '../services/call-report-smart-resolver.service';

export interface InstallCallReportSmartResult {
    entityTypeId: number;
    created: boolean;
    fieldsAdded: string[];
    fieldsExisting: string[];
    fieldsFailed: string[];
}

/**
 * Установка смарт-процесса «AI-анализ звонков» на портал по const-конфигу
 * (по принципу pbx-install, но без Excel и без таблицы smarts).
 *
 * Идемпотентна: повторный запуск не создаёт дубликатов типа и добавляет
 * только отсутствующие поля — так расширяется состав полей смарта
 * (обновите CALL_REPORT_SMART_FIELDS и вызовите установку повторно).
 *
 * Поля создаются ОДИНОЧНЫМИ userfieldconfig.add (POST JSON), не батчем:
 * batch-путь библиотеки не URL-кодирует значения, и русские label'ы /
 * enum-значения могут молча сломать команду.
 */
@Injectable()
export class InstallCallReportSmartUseCase {
    private readonly logger = new Logger(InstallCallReportSmartUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly smartResolver: CallReportSmartResolverService,
    ) {}

    async execute(domain: string): Promise<InstallCallReportSmartResult> {
        const { bitrix } = await this.pbxService.init(domain);

        // 1. Тип смарта: найти по коду или создать.
        const existingTypes = await bitrix.smartType.getListFull({
            filter: { code: CALL_REPORT_SMART_CODE },
            start: -1,
            order: { id: 'asc' },
        });
        let smartType = existingTypes.find(
            type => type.code === CALL_REPORT_SMART_CODE,
        );
        let created = false;

        if (!smartType) {
            const response = await bitrix.smartType.add({
                fields: {
                    code: CALL_REPORT_SMART_CODE,
                    title: CALL_REPORT_SMART_TITLE,
                    isUseInUserfieldEnabled: 'Y',
                    isAutomationEnabled: 'Y',
                    isBeginCloseDatesEnabled: 'N',
                    isBizProcEnabled: 'N',
                    isCategoriesEnabled: 'N',
                    isClientEnabled: 'Y',
                    isDocumentsEnabled: 'N',
                    isLinkWithProductsEnabled: 'N',
                    isMycompanyEnabled: 'N',
                    isRecyclebinEnabled: 'Y',
                    isStagesEnabled: 'N',
                    relations: {
                        parent: [
                            {
                                entityTypeId: BitrixOwnerTypeId.DEAL,
                                isChildrenListEnabled: 'Y',
                            },
                        ],
                    },
                },
            });
            if (!response.result?.type?.id) {
                throw new Error(
                    `Не удалось создать смарт ${CALL_REPORT_SMART_CODE} на ${domain}`,
                );
            }
            smartType = { ...response.result.type, categories: [] };
            created = true;
            this.logger.log(
                `Создан смарт ${CALL_REPORT_SMART_CODE} (entityTypeId=${smartType.entityTypeId}) на ${domain}`,
            );
        }

        const entityTypeId = Number(smartType.entityTypeId);

        // 2. Поля: добавить отсутствующие (идемпотентно).
        const { fieldsAdded, fieldsExisting, fieldsFailed } =
            await this.installFields(bitrix, entityTypeId);

        // 3. Кэш резолвера мог хранить «не установлен» — сбрасываем.
        await this.smartResolver.invalidate(domain);

        return {
            entityTypeId,
            created,
            fieldsAdded,
            fieldsExisting,
            fieldsFailed,
        };
    }

    private async installFields(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        entityTypeId: number,
    ): Promise<
        Pick<
            InstallCallReportSmartResult,
            'fieldsAdded' | 'fieldsExisting' | 'fieldsFailed'
        >
    > {
        const existing = await bitrix.userFieldConfig.getAllWithItems('crm', {
            entityId: `CRM_${entityTypeId}`,
        });
        const existingNames = new Set(existing.map(field => field.fieldName));

        const fieldsAdded: string[] = [];
        const fieldsExisting: string[] = [];
        const fieldsFailed: string[] = [];

        for (const def of CALL_REPORT_SMART_FIELDS) {
            const fieldName = buildCallReportUfName(entityTypeId, def.code);
            if (existingNames.has(fieldName)) {
                fieldsExisting.push(fieldName);
                continue;
            }
            try {
                await bitrix.userFieldConfig.add({
                    moduleId: 'crm',
                    field: this.buildFieldPayload(entityTypeId, fieldName, def),
                });
                fieldsAdded.push(fieldName);
            } catch (error) {
                this.logger.error(
                    `Поле ${fieldName} не установлено: ${(error as Error).message}`,
                );
                fieldsFailed.push(fieldName);
            }
        }

        return { fieldsAdded, fieldsExisting, fieldsFailed };
    }

    private buildFieldPayload(
        entityTypeId: number,
        fieldName: string,
        def: CallReportSmartFieldDef,
    ): Partial<IUserFieldConfig> {
        const payload: Partial<IUserFieldConfig> = {
            entityId: `CRM_${entityTypeId}`,
            fieldName,
            userTypeId: mapFieldTypeToBitrixType(def.type),
            multiple: def.isMultiple ? 'Y' : 'N',
            mandatory: 'N',
            showFilter: 'Y',
            showInList: 'Y',
            editInList: 'Y',
            isSearchable: 'Y',
            xmlId: def.code,
            editFormLabel: { ru: def.name },
            listColumnLabel: { ru: def.name },
            listFilterLabel: { ru: def.name },
        };
        if (payload.userTypeId === EUserFieldType.ENUMERATION) {
            payload.enum = (def.items ?? []).map(
                item =>
                    ({
                        value: item.VALUE,
                        def: 'N',
                        sort: item.SORT,
                        xmlId: item.CODE,
                    }) as IUserFieldConfigEnumerationItem,
            );
        }
        return payload;
    }
}
