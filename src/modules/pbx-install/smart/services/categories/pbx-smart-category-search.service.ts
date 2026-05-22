import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Category } from '@/modules/pbx-install/shared';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';
import { ParseSmartService } from '../parse/parse-smart.service';
import {
    PbxSmartCategoryMonitoringService,
    PbxSmartMergedCategory,
} from './pbx-smart-category-monitoring.service';

export interface PbxSmartCategorySearchItem {
    parse: Category;
    merged: PbxSmartMergedCategory | null;
}

export interface PbxSmartCategorySearchResultResponse {
    count: number;
    items: PbxSmartCategorySearchItem[];
}

/**
 * Поиск категорий смарта по подстроке: для каждого совпадения из parsed-шаблона
 * подкладывает соответствующую сводку из {@link PbxSmartCategoryMonitoringService}
 * (портал + Bitrix + стадии).
 *
 * Аналог {@link PbxDealCategorySearchService}, только адресация — `(domain, smartName, group, search)`.
 */
@Injectable()
export class PbxSmartCategorySearchService {
    private readonly logger = new Logger(PbxSmartCategorySearchService.name);

    constructor(
        private readonly parseSmartService: ParseSmartService,
        private readonly monitoringService: PbxSmartCategoryMonitoringService,
    ) {}

    async search(
        domain: string,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
        search: string,
    ): Promise<PbxSmartCategorySearchResultResponse> {
        const parsed = await this.parseSmartService.getParsedData(
            smartName,
            group,
        );
        const smart = parsed[0];
        if (!smart) {
            throw new NotFoundException(
                `No smart parsed for ${smartName}/${group}`,
            );
        }
        const parseCategories = smart.categories ?? [];
        if (parseCategories.length === 0) {
            throw new NotFoundException('categories not found in template');
        }

        const needle = search.trim().toLowerCase();
        const matched = parseCategories.filter(c => categoryMatches(c, needle));
        if (matched.length === 0) {
            return { count: 0, items: [] };
        }

        const codes = matched.map(c => c.code);
        const mergedList =
            await this.monitoringService.getPbxSmartCategoriesByCodes(
                domain,
                smartName,
                group,
                codes,
            );

        const items: PbxSmartCategorySearchItem[] = matched.map(parse => ({
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
