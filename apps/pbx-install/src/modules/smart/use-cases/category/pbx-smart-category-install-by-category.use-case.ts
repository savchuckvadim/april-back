import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { InstallSmartCategoryDto } from '../../dto/install-smart-category.dto';
import { InstallSmartCategoriesService } from '../../services/smart-categories/install-smart-categories.service';
import { SmartContextResolver } from '../../services/smart-context.resolver';

/**
 * Установка воронок и стадий смарта по переданному массиву категорий (POST-вариант).
 *
 * В отличие от {@link PbxSmartCategoryInstallByParseUseCase}, не читает Excel —
 * принимает категории напрямую в теле запроса. Удобно для повторной установки/
 * синхронизации и для интеграционных сценариев.
 *
 * Аналог {@link PbxDealCategoryInstallByCategoryUseCase} для сделок.
 */
@Injectable()
export class PbxSmartCategoryInstallByCategoryUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly installService: InstallSmartCategoriesService,
        private readonly contextResolver: SmartContextResolver,
    ) {}

    async installSmartCategories(dto: InstallSmartCategoryDto): Promise<void> {
        const { bitrix } = await this.pbxService.init(dto.domain);
        const ctx = await this.contextResolver.resolve({
            domain: dto.domain,
            type: dto.smartName,
            group: dto.group,
        });
        await this.installService.installTemplateCategories({
            bitrix,
            domain: dto.domain,
            smartType: dto.smartName,
            smartGroup: dto.group,
            entityTypeId: ctx.smartBitrixTypeId,
            templateCategories: dto.categories,
        });
    }
}
