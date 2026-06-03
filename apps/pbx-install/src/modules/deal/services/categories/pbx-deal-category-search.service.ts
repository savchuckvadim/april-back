import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Category } from '@/modules/pbx-install/shared';
import { PbxEntityGroupEnum } from '@/modules/pbx-install/shared/entity/field/parse-entity-field.service';
import {
    ParseCategoryNameEnum,
    ParseCategoryService,
} from './parse-category.service';
import {
    PbxDealCategoryMonitoringService,
    PbxDealMergedCategory,
} from './pbx-deal-category-monitoring.service';

/** Одна позиция результата поиска: шаблон + срез из портала/Bitrix. */
export interface PbxDealCategorySearchItem {
    parse: Category;
    merged: PbxDealMergedCategory | null;
}

export interface PbxDealCategorySearchResultResponse {
    count: number;
    items: PbxDealCategorySearchItem[];
}

/**
 * Поиск категорий сделки по подстроке: для каждого совпадения из parsed-шаблона
 * подкладывает соответствующую сводку из {@link PbxDealCategoryMonitoringService}
 * (портал + Bitrix + стадии).
 */
@Injectable()
export class PbxDealCategorySearchService {
    private readonly logger = new Logger(PbxDealCategorySearchService.name);

    constructor(
        private readonly parseCategoryService: ParseCategoryService,
        private readonly monitoringService: PbxDealCategoryMonitoringService,
    ) {}

    async search(
        domain: string,
        group: PbxEntityGroupEnum,
        search: string,
    ): Promise<PbxDealCategorySearchResultResponse> {
        const { categories: parseCategories } =
            await this.parseCategoryService.getParsedData(
                'all' as ParseCategoryNameEnum | 'all',
                group,
            );

        if (!parseCategories || parseCategories.length === 0) {
            throw new NotFoundException('categories not found');
        }

        const needle = search.trim().toLowerCase();
        const matched = parseCategories.filter(c => categoryMatches(c, needle));

        if (matched.length === 0) {
            return { count: 0, items: [] };
        }

        const codes = matched.map(c => c.code);
        const mergedList =
            await this.monitoringService.getPbxDealCategoriesByCodes(
                domain,
                codes,
            );

        const items: PbxDealCategorySearchItem[] = matched.map(parse => ({
            parse,
            merged:
                mergedList.find(
                    m =>
                        m.key.toLowerCase() === parse.code.toLowerCase() ||
                        m.p?.code === parse.code,
                ) ?? null,
        }));

        return { count: items.length, items };
    }
}

function categoryMatches(c: Category, needle: string): boolean {
    if (!needle) return true;
    return (
        c.code.toLowerCase().includes(needle) ||
        c.name.toLowerCase().includes(needle) ||
        (c.title?.toLowerCase().includes(needle) ?? false)
    );
}
