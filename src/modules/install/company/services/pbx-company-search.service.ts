import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
    PbxCompanyMergedField,
    PbxCompanyMonitoringService,
} from './pbx-company-monitoring.service';
import { PbxFieldEntityDto } from '@/modules/pbx-domain';

import { IBXField } from '@/modules/bitrix';
import { Field } from '@/modules/install/shared/parse-field-excel/type/parse-field.type';
import { ParseEntityFieldsAppName, ParseEntityFieldsService, PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';
import { PbxEntityType } from '@/shared';

export interface PbxCompanyFieldSearchResult {
    pbx: PbxFieldEntityDto | null;
    bx: IBXField | null;
    parse: Field | null;
}
export interface PbxCompanyFieldSearchResultResponse {
    count: number;
    items: PbxCompanyFieldSearchResult[];
}
@Injectable()
export class PbxCompanySearchService {
    private readonly logger = new Logger(PbxCompanySearchService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly parseCompanyService: ParseEntityFieldsService,
        private readonly pbxCompanyMonitoringService: PbxCompanyMonitoringService,
    ) {}

    async search(
        domain: string,
        group: PbxEntityGroupEnum,
        search: string,
    ): Promise<PbxCompanyFieldSearchResultResponse> {
        const { fields: parseFields } =
            await this.parseCompanyService.getParsedData(
                PbxEntityType.BTX_COMPANY,
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
        const companyData =
            await this.pbxCompanyMonitoringService.getPbxCompanyDataByFieldNames(
                domain,
                fieldNames,
            );
        const items = this.mergeParsedWithCompanyData(
            searchedParsedFields,
            companyData,
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
    private mergeParsedWithCompanyData(
        searchedParsedFields: Field[],
        companyData: PbxCompanyMergedField[],
    ): PbxCompanyFieldSearchResult[] {
        const result = [] as PbxCompanyFieldSearchResult[];

        for (const parsedField of searchedParsedFields) {
            const resultFieldData: PbxCompanyFieldSearchResult = {
                parse: parsedField,
                pbx: null,
                bx: null,
            };
            const companyField = companyData.find(
                f => f.name === parsedField.bxFieldName,
            );

            resultFieldData.pbx = companyField?.p ?? null;
            resultFieldData.bx = companyField?.bx ?? null;
            result.push(resultFieldData);
        }

        return result;
    }
}
