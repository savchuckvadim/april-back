import { Injectable, NotFoundException } from '@nestjs/common';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';
import { ParseRpaService } from '../parse/parse-rpa.service';
import {
    PbxRpaFieldMonitoringService,
    PbxRpaMergedField,
} from './pbx-rpa-field-monitoring.service';

export interface PbxRpaFieldSearchItem {
    parse: Field;
    merged: PbxRpaMergedField | null;
}

export interface PbxRpaFieldSearchResultResponse {
    count: number;
    items: PbxRpaFieldSearchItem[];
}

/**
 * Поиск полей RPA по подстроке: фильтрует parsed-шаблон по `name/code/bxFieldName`,
 * затем подкладывает срез из PortalDB и Bitrix через {@link PbxRpaFieldMonitoringService}.
 */
@Injectable()
export class PbxRpaFieldSearchService {
    constructor(
        private readonly parseRpaService: ParseRpaService,
        private readonly monitoringService: PbxRpaFieldMonitoringService,
    ) {}

    async search(
        domain: string,
        rpaName: RpaNameEnum,
        group: RpaGroupEnum,
        search: string,
    ): Promise<PbxRpaFieldSearchResultResponse> {
        const parsed = await this.parseRpaService.getParsedData(rpaName, group);
        const rpa = parsed[0];
        if (!rpa) {
            throw new NotFoundException(
                `No RPA parsed for ${rpaName}/${group}`,
            );
        }
        const parseFields = rpa.fields ?? [];
        const needle = search.trim().toLowerCase();
        const matched = parseFields.filter(f => fieldMatches(f, needle));
        if (matched.length === 0) {
            return { count: 0, items: [] };
        }

        const monitoring = await this.monitoringService.getPbxRpaFieldsByDomain(
            domain,
            rpaName,
        );

        const items: PbxRpaFieldSearchItem[] = matched.map(parse => ({
            parse,
            merged:
                monitoring.mergedFields.find(m =>
                    matchesParseField(m.name, parse.bxFieldName),
                ) ?? null,
        }));

        return { count: items.length, items };
    }
}

function fieldMatches(f: Field, needle: string): boolean {
    if (!needle) return true;
    return (
        (f.code?.toLowerCase().includes(needle) ?? false) ||
        (f.name?.toLowerCase().includes(needle) ?? false) ||
        (f.bxFieldName?.toLowerCase().includes(needle) ?? false)
    );
}

function matchesParseField(
    bxFullName: string,
    parseBxFieldName: string,
): boolean {
    const suffix = parseBxFieldName.replace(/^UF_(CRM|RPA)_/, '');
    return bxFullName.endsWith(`_${suffix}`) || bxFullName.endsWith(suffix);
}
