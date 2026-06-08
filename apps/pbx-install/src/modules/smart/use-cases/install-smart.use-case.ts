import { Injectable } from '@nestjs/common';
import { PortalSmartService } from '@lib/portal-lib/pbx-domain/portal-smart';
import { ParseSmartService } from '../services/parse/parse-smart.service';
import { InstallSmartDto } from '../dto/install-smart.dto';
import { PBXService } from '@/modules/pbx';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { InstallSmartCategoriesService } from '../services/smart-categories/install-smart-categories.service';
import { PbxSmartFieldInstallByParseUseCase } from './field/pbx-smart-field-install-by-parse.use-case';
import { IBXSmartType } from '@/modules/bitrix/domain/crm/smart-type';

/**
 * Полный сценарий установки смарт-процесса для портала: шаблон → Bitrix → наша БД → воронки/стадии.
 *
 * Этот use-case остаётся «толстым» оркестратором, потому что смарт нельзя установить
 * по кускам без смарт-only шагов (`crm.type.add` + upsert в `smarts`).
 *
 * Цепочка в `execute`:
 * 1. Подключение к Bitrix по домену портала (`PBXService.init`).
 * 2. Загрузка описания смарта из Excel (`ParseSmartService`): поля, воронки и т.д.
 * 3. Создание/проверка типа в Bitrix (`crm.type.add`).
 * 4. Upsert строки смарта в таблице `smarts` (`PortalSmartService.upsertFromBitrix`) — нужно для
 *    последующего резолва в field/category use-case-ах.
 * 5. Установка полей смарта — делегирует `PbxSmartFieldInstallByParseUseCase`
 *    (через shared/typed-entity → `userfieldconfig.*`).
 * 6. Синхронизация воронок и стадий по шаблону (`InstallSmartCategoriesService`).
 * 7. Ответ с агрегатом смартов портала для проверки результата.
 */
@Injectable()
export class InstallSmartUseCase {
    constructor(
        private readonly parseSmartService: ParseSmartService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxService: PBXService,
        private readonly installSmartCategoriesService: InstallSmartCategoriesService,
        private readonly fieldInstallByParse: PbxSmartFieldInstallByParseUseCase,
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
        const isStagesEnabled = categoriesForInstall.length > 0 ? 'Y' : 'N';

        // Что уже есть в портале по коду — нужно решить add vs delete-then-add.
        const existingTypes = await bitrix.smartType.getListFull({
            filter: { code: smartCode },
            start: -1,
            order: { id: 'asc' },
        });
        const existingSmartType = existingTypes.find(
            type => type.code === smartCode,
        );
        let smartType: IBXSmartType | null = null;
        if (existingSmartType) {
            // Берем существующий.

            bxResults.push(existingSmartType);
            smartType = existingSmartType;
            // return { error: 'Smart type already exists', bxResults };
        }

        if (!smartType) {
            // Шаг 3: регистрация динамического типа в CRM Bitrix.
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

            if (!bxResponse.result.type.id) {
                return { error: 'Smart type not created', bxResults };
            }
            smartType = bxResponse.result.type;
        }

        // Шаг 4: upsert строки смарта в БД портала ПЕРЕД установкой полей —
        // smart-field use-case резолвит смарт через `smarts` row.
        await this.portalSmartService.upsertFromBitrix(
            dto.domain,
            smartType,
            smart.type,
            smart.group,
        );

        // Шаг 5: поля смарта через общий shared/typed-entity сервис.
        const fieldsResult = await this.fieldInstallByParse.installSmartFields(
            dto.domain,
            dto.smartName,
            dto.group,
        );

        // Шаг 6: воронки/стадии — отдельный смартовый flow.
        await this.installSmartCategoriesService.installTemplateCategories({
            bitrix,
            domain: dto.domain,
            smartType: smart.type,
            smartGroup: smart.group,
            entityTypeId: Number(smartType.entityTypeId),
            templateCategories: categoriesForInstall,
        });

        // Шаг 7: актуальное состояние смартов портала.
        const portalSmart =
            await this.portalSmartService.getSmartsByPortalDomain(dto.domain);
        return {
            categoriesForInstall,
            fieldsResult,
            portalSmart,
            bxResults,
        };
    }
}
