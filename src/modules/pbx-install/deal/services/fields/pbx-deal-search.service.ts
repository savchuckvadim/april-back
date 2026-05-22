import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
    PbxDealMergedField,
    PbxDealMonitoringService,
} from './pbx-deal-monitoring.service';
import { PbxFieldEntityDto } from '@/modules/pbx-domain';

import { IBXField } from '@/modules/bitrix';
import { Field } from '@/modules/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { PbxEntityType } from '@/shared';
import { ParseEntityFieldsAppName, ParseEntityFieldsService, PbxEntityGroupEnum } from '@/modules/pbx-install/shared/entity/field/parse-entity-field.service';

export interface PbxDealFieldSearchResult {
    pbx: PbxFieldEntityDto | null;
    bx: IBXField | null;
    parse: Field | null;
}
export interface PbxDealFieldSearchResultResponse {
    count: number;
    items: PbxDealFieldSearchResult[];
}
@Injectable()
export class PbxDealSearchService {
    private readonly logger = new Logger(PbxDealSearchService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly parseDealService: ParseEntityFieldsService,
        private readonly pbxDealMonitoringService: PbxDealMonitoringService,
    ) { }

    async search(
        domain: string,
        group: PbxEntityGroupEnum,
        search: string,
    ): Promise<PbxDealFieldSearchResultResponse> {
        const { fields: parseFields } =
            await this.parseDealService.getParsedData(
                PbxEntityType.DEAL,
                ParseEntityFieldsAppName.ALL,
                group,
            );
        const searchedParsedFields = parseFields.filter(field =>
            field.name.toLowerCase().includes(search.toLowerCase()),
        );

        if (!parseFields || parseFields.length === 0) {
            throw new NotFoundException('fields not found');
        }
        const fieldNames = searchedParsedFields.map(field => field.bxFieldName); // example: XO_NAME
        const dealData =
            await this.pbxDealMonitoringService.getPbxDealDataByFieldNames(
                domain,
                fieldNames,
            );
        const items = this.mergeParsedWithDealData(
            searchedParsedFields,
            dealData,
        );
        return {
            count: items.length,
            items,
        };
    }

    /**
     * Для каждой строки из шаблона (parse) подставляет запись из БД портала и поле Bitrix по UF_CRM_{bitrixId}.
     * Сначала сопоставление по уже смердженным парам; иначе по отдельности (в БД или в Bitrix может не быть).
     */
    private mergeParsedWithDealData(
        searchedParsedFields: Field[],
        dealData: PbxDealMergedField[],
    ): PbxDealFieldSearchResult[] {
        const result = [] as PbxDealFieldSearchResult[];

        for (const parsedField of searchedParsedFields) {
            const resultFieldData: PbxDealFieldSearchResult = {
                parse: parsedField,
                pbx: null,
                bx: null,
            };
            const dealField = dealData.find(
                f => f.name === parsedField.bxFieldName,
            );

            resultFieldData.pbx = dealField?.p ?? null;
            resultFieldData.bx = dealField?.bx ?? null;
            result.push(resultFieldData);
        }

        return result;
    }
}
