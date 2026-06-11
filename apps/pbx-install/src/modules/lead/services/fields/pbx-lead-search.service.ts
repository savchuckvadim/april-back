import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
    PbxLeadMergedField,
    PbxLeadMonitoringService,
} from './pbx-lead-monitoring.service';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain';

import { IBXField } from '@/modules/bitrix';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { PbxEntityType } from '@/shared';
import {
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '@app/pbx-install/shared/entity/field/parse-entity-field.service';

export interface PbxLeadFieldSearchResult {
    pbx: PbxFieldEntityDto | null;
    bx: IBXField | null;
    parse: Field | null;
}
export interface PbxLeadFieldSearchResultResponse {
    count: number;
    items: PbxLeadFieldSearchResult[];
}
@Injectable()
export class PbxLeadSearchService {
    private readonly logger = new Logger(PbxLeadSearchService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly parseLeadService: ParseEntityFieldsService,
        private readonly pbxLeadMonitoringService: PbxLeadMonitoringService,
    ) {}

    async search(
        domain: string,
        group: PbxEntityGroupEnum,
        search: string,
    ): Promise<PbxLeadFieldSearchResultResponse> {
        const { fields: parseFields } =
            await this.parseLeadService.getParsedData(
                PbxEntityType.LEAD,
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
        const leadData =
            await this.pbxLeadMonitoringService.getPbxLeadDataByFieldNames(
                domain,
                fieldNames,
            );
        const items = this.mergeParsedWithLeadData(
            searchedParsedFields,
            leadData,
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
    private mergeParsedWithLeadData(
        searchedParsedFields: Field[],
        leadData: PbxLeadMergedField[],
    ): PbxLeadFieldSearchResult[] {
        const result = [] as PbxLeadFieldSearchResult[];

        for (const parsedField of searchedParsedFields) {
            const resultFieldData: PbxLeadFieldSearchResult = {
                parse: parsedField,
                pbx: null,
                bx: null,
            };
            const leadField = leadData.find(
                f => f.name === parsedField.bxFieldName,
            );

            resultFieldData.pbx = leadField?.p ?? null;
            resultFieldData.bx = leadField?.bx ?? null;
            result.push(resultFieldData);
        }

        return result;
    }
}
