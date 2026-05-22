import { Injectable } from '@nestjs/common';
import { InstallDealCategoryDto } from '../../dto/install-deal-category.dto';
import {
    InstallDealCategoriesResult,
    InstallDealCategoriesService,
} from '../../services/categories/install-deal-categories.service';

/**
 * Установка воронок и стадий сделки по переданному массиву категорий (POST-вариант).
 *
 * В отличие от {@link PbxDealCategoryInstallByParseUseCase}, не читает Excel —
 * принимает категории напрямую в теле запроса. Удобно для повторной установки/
 * синхронизации и для интеграционных сценариев.
 *
 * Аналог {@link PbxDealFieldInstallByFieldUseCase} для филдов.
 */
@Injectable()
export class PbxDealCategoryInstallByCategoryUseCase {
    constructor(
        private readonly installService: InstallDealCategoriesService,
    ) {}

    async installDealCategories(
        dto: InstallDealCategoryDto,
    ): Promise<InstallDealCategoriesResult> {
        return this.installService.installTemplateCategories(
            dto.domain,
            dto.categories,
        );
    }
}
