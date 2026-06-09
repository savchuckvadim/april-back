import { Injectable, NotFoundException } from '@nestjs/common';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';
import { RpaCategory } from '../../type/parse.type';
import { ParseRpaService } from '../parse/parse-rpa.service';
import {
    PbxRpaCategoryMonitoringResult,
    PbxRpaCategoryMonitoringService,
} from './pbx-rpa-category-monitoring.service';

export interface PbxRpaCategorySearchItem {
    parse: RpaCategory;
    merged: PbxRpaCategoryMonitoringResult | null;
}

export interface PbxRpaCategorySearchResultResponse {
    count: number;
    items: PbxRpaCategorySearchItem[];
}

/**
 * Поиск воронки RPA по подстроке: фильтрует parsed-шаблон по `code/name/title`,
 * затем подкладывает сводку из {@link PbxRpaCategoryMonitoringService}.
 */
@Injectable()
export class PbxRpaCategorySearchService {
    constructor(
        private readonly parseRpaService: ParseRpaService,
        private readonly monitoringService: PbxRpaCategoryMonitoringService,
    ) {}

    async search(
        domain: string,
        rpaName: RpaNameEnum,
        group: RpaGroupEnum,
        search: string,
    ): Promise<PbxRpaCategorySearchResultResponse> {
        const parsed = await this.parseRpaService.getParsedData(rpaName, group);
        const rpa = parsed[0];
        if (!rpa) {
            throw new NotFoundException(
                `No RPA parsed for ${rpaName}/${group}`,
            );
        }
        const needle = search.trim().toLowerCase();
        const matched = (rpa.categories ?? []).filter(c =>
            categoryMatches(c, needle),
        );
        if (matched.length === 0) {
            return { count: 0, items: [] };
        }

        const merged = await this.monitoringService.getPbxRpaCategoryByDomain(
            domain,
            rpaName,
        );

        const items: PbxRpaCategorySearchItem[] = matched.map(parse => ({
            parse,
            merged,
        }));

        return { count: items.length, items };
    }
}

function categoryMatches(c: RpaCategory, needle: string): boolean {
    if (!needle) return true;
    return (
        c.code.toLowerCase().includes(needle) ||
        c.name.toLowerCase().includes(needle) ||
        (c.title?.toLowerCase().includes(needle) ?? false)
    );
}
