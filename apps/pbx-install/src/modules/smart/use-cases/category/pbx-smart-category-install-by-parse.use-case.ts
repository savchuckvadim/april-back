import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';
import { ParseSmartService } from '../../services/parse/parse-smart.service';
import { InstallSmartCategoriesService } from '../../services/smart-categories/install-smart-categories.service';
import { SmartContextResolver } from '../../services/smart-context.resolver';

/**
 * Установка воронок и стадий смарта из Excel-шаблона.
 *
 * 1. Парсим Excel через `ParseSmartService.getParsedData(smartName, group)`.
 * 2. Резолвим контекст смарта (Bitrix entityTypeId) через `SmartContextResolver`.
 * 3. Передаём категории в {@link InstallSmartCategoriesService}, который
 *    синхронизирует их с Bitrix (`crm.category.*` + `crm.status.*`) и зеркалит
 *    в портальную БД (`btx_categories` + `btx_stages`).
 *
 * Аналог {@link PbxDealCategoryInstallByParseUseCase} для сделок.
 */
@Injectable()
export class PbxSmartCategoryInstallByParseUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseSmartService: ParseSmartService,
        private readonly installService: InstallSmartCategoriesService,
        private readonly contextResolver: SmartContextResolver,
    ) {}

    async installSmartCategories(
        domain: string,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
    ): Promise<void> {
        const { bitrix } = await this.pbxService.init(domain);
        const parsed = await this.parseSmartService.getParsedData(
            smartName,
            group,
        );
        const smart = parsed[0];
        const ctx = await this.contextResolver.resolve({
            domain,
            type: smartName,
            group,
        });
        await this.installService.installTemplateCategories({
            bitrix,
            domain,
            smartType: smartName,
            smartGroup: group,
            entityTypeId: ctx.smartBitrixTypeId,
            templateCategories: smart.categories ?? [],
        });
    }
}
