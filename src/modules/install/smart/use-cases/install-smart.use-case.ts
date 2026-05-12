import { Injectable } from '@nestjs/common';
import { PortalSmartService } from '@/modules/pbx-domain/portal-smart';
import { ParseSmartService } from '../services/parse/parse-service';
import { InstallSmartDto } from '../dto/install-smart.dto';
import { PBXService } from '@/modules/pbx';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { InstallSmartFieldsService } from '@/modules/install/field/install-smart-fields.service';
import { IUserFieldConfig } from '@/modules/bitrix/domain/userfieldconfig/interface/userfieldconfig.interface';
import { SaveSmartFieldsService } from '../services/smart-fields/save-smart-fields.service';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { InstallSmartCategoriesService } from '../services/smart-categories/install-smart-categories.service';

function isUserFieldBatchEntry(
    value: unknown,
): value is { field: IUserFieldConfig } {
    if (typeof value !== 'object' || value === null || !('field' in value)) {
        return false;
    }
    const { field } = value as { field: unknown };
    return typeof field === 'object' && field !== null;
}

/**
 * Полный сценарий установки смарт-процесса для портала: шаблон → Bitrix → наша БД → воронки/стадии.
 *
 * Цепочка в `execute`:
 * 1. Подключение к Bitrix по домену портала (`PBXService.init`).
 * 2. Загрузка описания смарта из Excel/шаблона (`ParseSmartService`): поля, воронки и т.д.
 * 3. Создание типа в Bitrix (`crm.type.add`): код смарта, флаги возможностей, связь с родителем (сделка).
 * 4. Создание пользовательских полей только в Bitrix (`InstallSmartFieldsService`).
 * 5. Разбор ответа батча Bitrix → пары `code` + фактический `IUserFieldConfig`.
 * 6. Upsert строки смарта в таблице `smarts` (`PortalSmartService.upsertFromBitrix`).
 * 7. Зеркалирование полей в нашу модель `t_fields` и связанное (`SaveSmartFieldsService`).
 * 8. Синхронизация воронок и стадий по шаблону (`InstallSmartCategoriesService`).
 * 9. Ответ с агрегатом смартов портала для проверки результата.
 */
@Injectable()
export class InstallSmartUseCase {
    constructor(
        private readonly parseSmartService: ParseSmartService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxService: PBXService,
        private readonly saveSmartFieldsService: SaveSmartFieldsService,
        private readonly installSmartCategoriesService: InstallSmartCategoriesService,
    ) {}

    async execute(dto: InstallSmartDto) {
        // Шаг 1–2: клиент Bitrix + описание смарта из шаблона (имя смарта и группа задают строку/лист).
        const { bitrix } = await this.pbxService.init(dto.domain);
        const parsedSmartData = await this.parseSmartService.getParsedData(
            dto.smartName,
            dto.group,
        );

        const bxResults: unknown[] = [];

        const smart = parsedSmartData[0];
        const smartCode = `${smart.type}_${smart.group}`;
        const categoriesForInstall = smart.categories;
        // В Bitrix стадии включаются только если в шаблоне есть воронки (категории).
        const isStagesEnabled = categoriesForInstall.length > 0 ? 'Y' : 'N';

        // Диагностика: что уже есть в портале по коду (перед add); не влияет на логику установки.
        const testSmartResponseGetByCode = await bitrix.smartType.getListFull({
            filter: {
                code: smartCode,
            },
            start: -1,
            order: {
                id: 'asc',
            },
        });
        const existingSmartType = testSmartResponseGetByCode.find(
            type => type.code === smartCode,
        );
        testSmartResponseGetByCode.forEach(type => {
            console.log('type.code', type.code);
            console.log('type', type);
            type.categories.forEach(category => {
                console.log('category', category);
                category.stages.forEach(stage => {
                    console.log('stage', stage);
                });
            });
        });
        if (existingSmartType) {
            //пока что удаляем, в будущем будем обновлять
            // TODO: переделать на update
            const deleteSmartTypeBitrixResponse = await bitrix.smartType.delete(
                {
                    id: Number(existingSmartType.id),
                },
            );
            bxResults.push(deleteSmartTypeBitrixResponse);
            return {
                error: 'Smart type already exists',
                bxResults,
            };
        }
        // Шаг 3: регистрация динамического типа в CRM Bitrix (получаем `id` типа и `entityTypeId`).
        const bxResponse = await bitrix.smartType.add({
            fields: {
                code: smartCode,
                title: smart.title,
                isUseInUserfieldEnabled: 'Y',
                isAutomationEnabled: 'Y',
                isBeginCloseDatesEnabled: 'Y',
                isBizProcEnabled: 'Y',
                isCategoriesEnabled: 'Y',
                isClientEnabled: 'Y',
                isDocumentsEnabled: 'Y',
                isLinkWithProductsEnabled: 'Y',
                isMycompanyEnabled: 'Y',
                isRecyclebinEnabled: 'Y',
                isStagesEnabled,
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

        bxResults.push(bxResponse);

        if (bxResponse.result.type.id) {
            // Шаг 4: UF только в Bitrix (батч `userfield.add`), привязка к `CRM_{smartTypeId}`.
            const installSmartFieldsService = new InstallSmartFieldsService(
                bitrix,
            );
            const bxFieldsResults =
                await installSmartFieldsService.installFields(
                    smart.fields,
                    bxResponse.result.type.id,
                );
            // Шаг 5: из ответа батча достаём созданные конфиги полей по ключам запроса.
            const preparedBxFields =
                this.prepareBitrixFieldsResults(bxFieldsResults);

            // Шаг 6: сохраняем/обновляем метаданные смарта в `smarts` (entityTypeId, bitrixId, префиксы стадий/фильтров).
            await this.portalSmartService.upsertFromBitrix(
                dto.domain,
                bxResponse.result.type,
                smart.type,
                smart.group,
            );
            // Шаг 7: те же поля — в нашей БД (`PbxFieldService.upsertFields`), чтобы портал знал коды и enum.
            await this.saveSmartFieldsService.installFields({
                domain: dto.domain,
                fields: smart.fields,
                bxFields: preparedBxFields,
                type: smart.type,
                group: smart.group,
            });

            // Шаг 8: воронки в Bitrix + `btx_categories`, затем стадии в Bitrix + `btx_stages`.
            await this.installSmartCategoriesService.installTemplateCategories({
                bitrix,
                domain: dto.domain,
                smartType: smart.type,
                smartGroup: smart.group,
                entityTypeId: Number(bxResponse.result.type.entityTypeId),
                templateCategories: categoriesForInstall,
            });

            // Шаг 9: отдаём актуальное состояние смартов портала (с полями и категориями из БД).
            const portalSmart =
                await this.portalSmartService.getSmartsByPortalDomain(
                    dto.domain,
                );
            return {
                categoriesForInstall,
                portalSmart,
                bxResults,
            };
        }
        // Тип в Bitrix не создался или нет `id` — дальше поля и БД не трогаем.
        return {
            error: 'Fields not created',

            bxResults,
        };
    }

    /** Вытаскивает из результатов батча записи вида `{ field: IUserFieldConfig }` и склеивает с кодом поля из шаблона. */
    private prepareBitrixFieldsResults(
        bxFieldsResults: IBitrixBatchResponseResult[],
    ): { code: string; field: IUserFieldConfig }[] {
        const fields: { code: string; field: IUserFieldConfig }[] = [];
        for (const result of bxFieldsResults) {
            const batchEntries = result.result as Record<string, unknown>;
            for (const key of Object.keys(batchEntries)) {
                const entry = batchEntries[key];
                if (!isUserFieldBatchEntry(entry)) continue;
                fields.push({ code: key, field: entry.field });
            }
        }
        return fields;
    }
}
