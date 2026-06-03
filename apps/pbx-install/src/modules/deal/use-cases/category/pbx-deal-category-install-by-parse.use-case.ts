import { Injectable } from '@nestjs/common';
import { PbxEntityGroupEnum } from '@/modules/pbx-install/shared/entity/field/parse-entity-field.service';
import {
    ParseCategoryName,
    ParseCategoryService,
} from '../../services/categories/parse-category.service';
import {
    InstallDealCategoriesResult,
    InstallDealCategoriesService,
} from '../../services/categories/install-deal-categories.service';

/**
 * Установка воронок и стадий сделки из Excel-шаблона.
 *
 * 1. Парсим Excel через `ParseCategoryService.getParsedData(categoryName, group)`.
 * 2. Передаём список воронок в {@link InstallDealCategoriesService}, который
 *    синхронизирует их с Bitrix (`crm.category.*` + `crm.status.*`) и зеркалит
 *    в портальную БД (`btx_categories` + `btx_stages`).
 *
 * Аналог {@link PbxDealFieldInstallByParseUseCase} для филдов, только для категорий/стадий.
 */
@Injectable()
export class PbxDealCategoryInstallByParseUseCase {
    constructor(
        private readonly parseCategoryService: ParseCategoryService,
        private readonly installService: InstallDealCategoriesService,
    ) {}

    async installDealCategories(
        domain: string,
        group: PbxEntityGroupEnum,
        categoryName: ParseCategoryName,
    ): Promise<InstallDealCategoriesResult> {
        const { categories } = await this.parseCategoryService.getParsedData(
            categoryName,
            group,
        );
        return this.installService.installTemplateCategories(
            domain,
            categories,
        );
    }
}
