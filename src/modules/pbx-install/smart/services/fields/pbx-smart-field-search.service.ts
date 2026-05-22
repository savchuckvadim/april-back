import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Field } from '@/modules/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';
import { ParseSmartService } from '../parse/parse-smart.service';
import {
    PbxSmartFieldMonitoringService,
    PbxSmartMergedField,
} from './pbx-smart-field-monitoring.service';

/** Одна позиция результата поиска по полям смарта. */
export interface PbxSmartFieldSearchItem {
    parse: Field;
    merged: PbxSmartMergedField | null;
}

export interface PbxSmartFieldSearchResultResponse {
    count: number;
    items: PbxSmartFieldSearchItem[];
}

/**
 * Поиск полей смарта по подстроке: фильтрует parsed-шаблон по `name/code/bxFieldName`,
 * затем для каждого совпадения подкладывает срез из портальной БД и Bitrix
 * через {@link PbxSmartFieldMonitoringService}.
 *
 * Аналог {@link PbxDealSearchService}, только адресация — `(domain, smartName, group, search)`.
 */
@Injectable()
export class PbxSmartFieldSearchService {
    private readonly logger = new Logger(PbxSmartFieldSearchService.name);

    constructor(
        private readonly parseSmartService: ParseSmartService,
        private readonly monitoringService: PbxSmartFieldMonitoringService,
    ) {}

    async search(
        domain: string,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
        search: string,
    ): Promise<PbxSmartFieldSearchResultResponse> {
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
        const parseFields = smart.fields ?? [];
        if (parseFields.length === 0) {
            throw new NotFoundException('fields not found in template');
        }
        const needle = search.trim().toLowerCase();
        const matched = parseFields.filter(f => fieldMatches(f, needle));
        if (matched.length === 0) {
            return { count: 0, items: [] };
        }

        // Полное имя UF в Bitrix для смарта = `UF_CRM_<smartTypeId>_<bxFieldName>` —
        // monitoring уже знает smartTypeId, нам тут достаточно только bxFieldName-ов.
        // Чтобы избежать второго резолва — берём merged по всем полям и фильтруем.
        const monitoring = await this.monitoringService.getPbxSmartFieldsByDomain(
            domain,
            smartName,
            group,
        );

        const items: PbxSmartFieldSearchItem[] = matched.map(parse => ({
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
    console.log(f);
    return (
        f.code?.toLowerCase().includes(needle) ||
        f.name?.toLowerCase().includes(needle) ||
        f.bxFieldName?.toLowerCase().includes(needle)
    );
}

/**
 * `bxFieldName` в шаблоне — это суффикс (`OP_STATUS`), а в Bitrix `fieldName` —
 * полное имя `UF_CRM_<smartTypeId>_OP_STATUS`. Сравниваем по суффиксу.
 */
function matchesParseField(bxFullName: string, parseBxFieldName: string): boolean {
    const suffix = parseBxFieldName.replace(/^UF_CRM_/, '');
    return bxFullName.endsWith(`_${suffix}`) || bxFullName.endsWith(suffix);
}
