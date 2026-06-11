import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
    PbxContactMergedField,
    PbxContactMonitoringService,
} from './pbx-contact-monitoring.service';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain';

import { IBXField } from '@/modules/bitrix';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import {
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
import { PbxEntityType } from '@/shared';

export interface PbxContactFieldSearchResult {
    pbx: PbxFieldEntityDto | null;
    bx: IBXField | null;
    parse: Field | null;
}
export interface PbxContactFieldSearchResultResponse {
    count: number;
    items: PbxContactFieldSearchResult[];
}
@Injectable()
export class PbxContactSearchService {
    private readonly logger = new Logger(PbxContactSearchService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly parseContactService: ParseEntityFieldsService,
        private readonly pbxContactMonitoringService: PbxContactMonitoringService,
    ) {}

    async search(
        domain: string,
        group: PbxEntityGroupEnum,
        search: string,
    ): Promise<PbxContactFieldSearchResultResponse> {
        const { fields: parseFields } =
            await this.parseContactService.getParsedData(
                PbxEntityType.BTX_CONTACT,
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
        const contactData =
            await this.pbxContactMonitoringService.getPbxContactDataByFieldNames(
                domain,
                fieldNames,
            );
        const items = this.mergeParsedWithContactData(
            searchedParsedFields,
            contactData,
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
    private mergeParsedWithContactData(
        searchedParsedFields: Field[],
        contactData: PbxContactMergedField[],
    ): PbxContactFieldSearchResult[] {
        const result = [] as PbxContactFieldSearchResult[];

        for (const parsedField of searchedParsedFields) {
            const resultFieldData: PbxContactFieldSearchResult = {
                parse: parsedField,
                pbx: null,
                bx: null,
            };
            const contactField = contactData.find(
                f => f.name === parsedField.bxFieldName,
            );

            resultFieldData.pbx = contactField?.p ?? null;
            resultFieldData.bx = contactField?.bx ?? null;
            result.push(resultFieldData);
        }

        return result;
    }
}
