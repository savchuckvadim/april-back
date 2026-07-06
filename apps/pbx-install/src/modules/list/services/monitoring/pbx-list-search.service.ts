import { Injectable } from '@nestjs/common';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { ParseListService } from '../parse/parse-list.service';
import { ListFolderEnum, ListGroupEnum } from '../../type/parse.type';
import {
    PbxListFieldMonitoringService,
    PbxListMergedField,
} from './pbx-list-field-monitoring.service';

export interface PbxListFieldSearchItem {
    list: { type: string; group: string; code: string };
    parse: Field;
    pbx: PbxListMergedField['p'];
    bx: PbxListMergedField['bx'];
}

export interface PbxListFieldSearchResultResponse {
    count: number;
    items: PbxListFieldSearchItem[];
}

/**
 * Поиск по полям шаблона списка (подстрока в code/name/bxFieldName)
 * с подложенным состоянием PortalDB и Bitrix (зеркало PbxCompanySearchService).
 */
@Injectable()
export class PbxListSearchService {
    constructor(
        private readonly parseListService: ParseListService,
        private readonly monitoringService: PbxListFieldMonitoringService,
    ) {}

    async search(
        domain: string,
        listName: ListFolderEnum,
        group: ListGroupEnum,
        search: string,
    ): Promise<PbxListFieldSearchResultResponse> {
        const parsedLists = await this.parseListService.getParsedData(
            listName,
            group,
        );
        const needle = search.toLowerCase();
        const items: PbxListFieldSearchItem[] = [];

        for (const list of parsedLists) {
            const matchedFields = (list.fields ?? []).filter(
                f =>
                    f.code.toLowerCase().includes(needle) ||
                    f.name.toLowerCase().includes(needle) ||
                    f.bxFieldName.toLowerCase().includes(needle),
            );
            if (matchedFields.length === 0) {
                continue;
            }
            const merged =
                await this.monitoringService.getPbxListDataByFieldCodes(
                    domain,
                    list.type,
                    list.group,
                    matchedFields.map(f => f.bxFieldName),
                );
            for (const field of matchedFields) {
                const mergedField = merged.find(
                    m => m.name === field.bxFieldName.toUpperCase(),
                );
                items.push({
                    list: {
                        type: list.type,
                        group: list.group,
                        code: list.code,
                    },
                    parse: field,
                    pbx: mergedField?.p ?? null,
                    bx: mergedField?.bx ?? null,
                });
            }
        }

        return { count: items.length, items };
    }
}
