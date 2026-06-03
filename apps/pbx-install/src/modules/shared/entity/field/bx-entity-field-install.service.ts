import { PBXService } from '@/modules/pbx';
import { mapFieldTypeToBitrixType } from '@/modules/pbx-domain';
import {
    BitrixEnumerationOption,
    BitrixService,
    BxCompanyBatchService,
    BxCompanyService,
    BxDealBatchService,
    BxDealService,
    IBXField,
} from '@/modules/bitrix';

import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { delay } from '@/shared';
import { Field, ListItem, ListItemDto } from '../../parse-field-excel';

/**
 * TODO: перенести в shared и использовать во всех сущностях где устанавливаются филды в битрикс
 *
 */
/**
 * Установка полей для компании в Bitrix
 * 1. Получаем поля для установки из excel - parsed по group и app
 * 2. Получаем все поля сущности из битрикс
 * 3. Добавляем или обновляем в битриксе каждое поле из parsed
 * 4. Отдельно собираем ошибки тех полей с которыми не получилось что-то сделать - чтобы позже по ним сделать retry

 * 5. Если есть поля с ошибками - делаем retry
 * 6. Возвращаем успешные коды полей
 *
 */
const MAX_RETRY_COUNT = 0;
const RETRY_DELAY = 1000;

interface IBxFieldInstallResult {
    code: string;
    result: number | boolean;
}
export interface IBxFieldWithParsedResult extends IBxFieldInstallResult {
    parsedField: Field;
    bxField: IBXField | undefined;
}
interface IBatchResult {
    errorCodes: string[];
    results: IBxFieldInstallResult[];
}
export interface IBxEntityFieldsInstallResult {
    errorCodes: string[];
    results: IBxFieldWithParsedResult[];
    countSuccess: number;
    countFailed: number;
    countTotal: number;
}
export type IBxEntityInstallType = 'company' | 'deal';

export class BxEntityFieldsInstallService {
    private bitrix!: BitrixService;
    private bxEtityService!: BxCompanyService | BxDealService;
    private bxEntityBatchService!: BxCompanyBatchService | BxDealBatchService;
    private readonly entity: IBxEntityInstallType;
    private readonly domain: string;
    private readonly pbxService: PBXService;
    private readonly parseFields: Field[];
    constructor(
        domain: string,
        pbxService: PBXService,
        entity: IBxEntityInstallType,
        parseFields: Field[],
    ) {
        this.domain = domain;
        this.entity = entity;
        this.pbxService = pbxService;
        this.parseFields = parseFields;
    }
    private async init() {
        const { bitrix } = await this.pbxService.init(this.domain);
        this.bitrix = bitrix;
        this.bxEtityService = this.bitrix[this.entity];
        this.bxEntityBatchService = this.bitrix.batch[this.entity];
        if (!this.bitrix) {
            throw new Error(`Bitrix service not found for entity`);
        }
        if (!this.bitrix || !this.bxEtityService) {
            throw new Error(
                `Entity service not found for entity: ${this.entity}`,
            );
        }
        if (!this.bxEntityBatchService) {
            throw new Error(
                `Entity Batch service not found for entity: ${this.entity}`,
            );
        }
    }

    public async installBxFields(): Promise<IBxEntityFieldsInstallResult> {
        await this.init();
        // получаем все пользовательские поля сущности из битрикса
        const existingBxFields = await this.getCurrentBxFields();

        const errorCodes = [] as string[];
        const results = [] as IBxFieldInstallResult[];
        // собираем команды для обновления или добавления полей в битрикс
        void this.getBatchComands(this.parseFields, existingBxFields);

        // выполняем команды
        const batchResponse = await this.bitrix.api.callBatchWithConcurrency(1);
        // получаем результаты выполнения batch и обрабатываем их
        const { errorCodes: batchErrorCodes, results: batchResults } =
            this.prepareBatchResult(batchResponse);
        errorCodes.push(...batchErrorCodes);
        results.push(...batchResults);
        // если есть ошибки, то повторяем команды
        // пока не закончатся ошибки или не достигнем максимального количества попыток
        await this.retryBatch(errorCodes, results);
        // получаем результаты выполнения команд и обрабатываем их
        return await this.getResult(errorCodes, results);
    }

    private async getCurrentBxFields(): Promise<IBXField[]> {
        const bitrixFieldsResponse = await this.bxEtityService.getFieldsList();
        return bitrixFieldsResponse.result;
    }

    private getBitrixFieldByCodeAndParsedData(
        code: string,
        parsedFields: Field[],
        bxFields: IBXField[],
    ): IBXField | undefined {
        const parsedField = parsedFields.find(f => f.code === code);
        if (!parsedField) {
            return undefined;
        }
        return bxFields.find(
            f =>
                f.FIELD_NAME ===
                this.getBxFieldNameByParseName(parsedField.bxFieldName),
        );
    }

    private async getResult(
        errorCodes: string[],
        results: IBxFieldInstallResult[],
    ): Promise<IBxEntityFieldsInstallResult> {
        const bxResultsWithParsed = [] as IBxFieldWithParsedResult[];
        const currentFieldAfterInstall = await this.getCurrentBxFields();
        for (const result of results) {
            const bxField = this.getBitrixFieldByCodeAndParsedData(
                result.code,
                this.parseFields,
                currentFieldAfterInstall,
            );
            const parsedField = this.parseFields.find(
                f => f.code === result.code,
            );
            if (parsedField) {
                bxResultsWithParsed.push({
                    ...result,
                    bxField: bxField,
                    parsedField,
                });
            }
        }

        return {
            errorCodes,
            results: bxResultsWithParsed,
            countSuccess: bxResultsWithParsed.length,
            countFailed: results.length - bxResultsWithParsed.length,
            countTotal: this.parseFields.length || 0,
        };
    }

    private async retryBatch(
        errorCodes: string[],
        results: IBatchResult['results'],
    ): Promise<IBatchResult> {
        let retryCount = 0;
        while (errorCodes.length > 0 && retryCount < MAX_RETRY_COUNT) {
            await delay(RETRY_DELAY);
            const batchResponse =
                await this.bitrix.api.callBatchWithConcurrency(1);
            const { errorCodes: batchErrorCodes, results: batchResults } =
                this.prepareBatchResult(batchResponse);
            errorCodes = batchErrorCodes;
            results.push(...batchResults);
            retryCount++;
        }
        return { errorCodes, results: results };
    }

    private prepareBatchResult(
        batchResponse: IBitrixBatchResponseResult[],
    ): IBatchResult {
        const errorCodes = [] as string[];
        const results: IBatchResult['results'] = [] as IBatchResult['results'];
        for (const response of batchResponse) {
            if (response.result_error) {
                if (typeof response.result_error === 'object') {
                    Object.keys(response.result_error).forEach(key => {
                        errorCodes.push(key);
                    });
                }
            }
            if (response.result) {
                Object.keys(response.result).forEach(key => {
                    results.push({
                        code: key,
                        result: response.result[key] as number | boolean,
                    });
                });
            }
        }
        return { errorCodes, results };
    }

    private getBatchComands(
        parseFields: Field[],
        existingBitrixFields: IBXField[],
    ): void {
        for (const parseField of parseFields) {
            const bxFieldName = this.getBxFieldNameByParseName(
                parseField.bxFieldName,
            );
            const bitrixField = existingBitrixFields.find(
                f => f.FIELD_NAME === bxFieldName,
            );

            const fieldData: Partial<IBXField> =
                this.getBxFieldDataByParseField(parseField, bitrixField);
            if (bitrixField) {
                this.bxEntityBatchService.updateField(
                    parseField.code,
                    bitrixField.ID,
                    fieldData,
                );
            } else {
                this.bxEntityBatchService.addField(parseField.code, fieldData);
            }
        }
    }

    private getBxFieldDataByParseField(
        parseField: Field,
        bitrixField?: IBXField,
    ): Partial<IBXField> {
        const bxFieldType = mapFieldTypeToBitrixType(parseField.type);
        const bitrixFieldName = this.getBxFieldNameByParseName(
            parseField.bxFieldName,
        );
        const fieldData: Partial<IBXField> = {
            LABEL: parseField.name,
            EDIT_FORM_LABEL: {
                ru: parseField.name,
            },
            LIST_COLUMN_LABEL: {
                ru: parseField.name,
            },
            LIST_FILTER_LABEL: {
                ru: parseField.name,
            },
            FIELD_NAME: bitrixFieldName,
            USER_TYPE_ID: bxFieldType,
            SORT: String(parseField.order),
            MULTIPLE: parseField.isMultiple ? 'Y' : 'N',
            MANDATORY: 'N',
            SHOW_FILTER: 'Y',
            XML_ID: parseField.code,
        };

        if (parseField.type === 'enumeration') {
            fieldData.LIST = this.getBxFieldListDataByParseField(
                parseField.list || [],
                bitrixField?.LIST || [],
            );
        }
        return fieldData;
    }

    private getBxFieldListDataByParseField(
        list: ListItemDto[],
        bitrixList?: BitrixEnumerationOption[],
    ): BitrixEnumerationOption[] {
        const result = [] as BitrixEnumerationOption[];
        list.map(item => {
            const bitrixItem = bitrixList?.find(f =>
                this.compareItems(f, item),
            );
            console.log('getBxFieldListDataByParseField item', item);
            console.log(
                'getBxFieldListDataByParseField bitrixItem',
                bitrixItem,
            );
            const data: Partial<BitrixEnumerationOption> = {
                SORT: String(item.SORT),
                VALUE: item.VALUE,
                DEF: 'N',
            };
            if (!bitrixItem) {
                // если поле не существует в битриксе, то добавляем его с кодом из excel
                data.XML_ID = item.CODE;
            } else {
                // если поле существует в битриксе, то обновляем его передавая id из битрикса
                data.ID = bitrixItem.ID;
            }
            result.push(data as BitrixEnumerationOption);
        });
        const excessItems = bitrixList?.filter(
            f => !list.find(i => this.compareItems(f, i)),
        );
        console.log(
            'лишние элементы которые бы удалить из битрикса ',
            excessItems,
        );
        return result;
    }
    private compareItems(
        bxItem: BitrixEnumerationOption,
        parsedItem: ListItem,
    ): boolean {
        return (
            this.alnumOnly(bxItem.VALUE) === this.alnumOnly(parsedItem.VALUE) ||
            this.alnumOnly(bxItem.XML_ID) === this.alnumOnly(parsedItem.CODE)
        );
    }
    private alnumOnly(s: string | undefined): string {
        if (!s) {
            return '';
        }
        return s
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ''); // убрать всё кроме букв/цифр любого алфавита
    }
    private getBxFieldNameByParseName(parseName: string): string {
        return `UF_CRM_${parseName}`;
    }
}
