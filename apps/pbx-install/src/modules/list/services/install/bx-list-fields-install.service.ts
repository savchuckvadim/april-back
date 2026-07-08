import { Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    BitrixService,
    BxListAddressInput,
    BxListFieldListPayload,
    BxListFieldsGetResponse,
    IBXListFieldDescription,
    IBXListFieldPayload,
} from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { mapParseTypeToListFieldType } from './list-field-type.mapper';
import {
    ListFieldCodeKey,
    fullListFieldCode,
    listFieldCodeCandidates,
} from '../../lib/list-field-code.util';

/** Ссылка на поле списка в Bitrix: FIELD_ID (PROPERTY_N) + описание */
export interface IBxListFieldRef {
    fieldId: string;
    description: IBXListFieldDescription;
}

export interface IBxListInstalledFieldResult {
    code: string;
    result: string | number | boolean;
    parsedField: Field;
    bxField: IBxListFieldRef | undefined;
}

export interface IBxListFieldsInstallResult {
    errorCodes: string[];
    results: IBxListInstalledFieldResult[];
    countSuccess: number;
    countFailed: number;
    countTotal: number;
}

/**
 * Установка полей универсального списка в Bitrix (`lists.field.*`).
 *
 * Каркас как у AbstractBxFieldsInstallService (init → текущие поля →
 * batch add/update → отправка → merge), но абстракция не переиспользуется:
 * поля списков — свойства инфоблока (адресация FIELD_ID=PROPERTY_N,
 * сопоставление по CODE, payload UPPERCASE, LIST — полный набор значений),
 * а не UF-поля (FIELD_NAME).
 *
 * Enum-значения: LIST трактуется Bitrix как полный набор, поэтому payload
 * собирается из шаблонных значений (существующие сохраняют id, новые — n0…)
 * плюс существующие в Bitrix значения, которых нет в шаблоне (не удаляем
 * кастомные значения клиента).
 *
 * НЕ `@Injectable()` — создаётся через `new` в use-case с конкретным domain
 * (правило CLAUDE.md про race condition с this.bitrix).
 */
export class BxListFieldsInstallService {
    private readonly logger = new Logger(BxListFieldsInstallService.name);
    private bitrix!: BitrixService;

    constructor(
        private readonly domain: string,
        private readonly pbxService: PBXService,
        private readonly listAddress: BxListAddressInput,
        /** Ключ списка — из него строится полный CODE свойств (`${group}_${type}_${code}`) */
        private readonly listKey: ListFieldCodeKey,
        private readonly parseFields: Field[],
    ) {}

    public async installFields(): Promise<IBxListFieldsInstallResult> {
        await this.init();
        const existingFields = await this.fetchCurrentFields();

        this.buildBatchCommands(existingFields);

        const batchResponse = await this.bitrix.api.callBatchWithConcurrency(1);
        const { errorCodes, results } = this.prepareBatchResult(batchResponse);

        return await this.getResult(errorCodes, results);
    }

    private async init(): Promise<void> {
        const { bitrix } = await this.pbxService.init(this.domain);
        this.bitrix = bitrix;
        if (!this.bitrix) {
            throw new Error('Bitrix service not found');
        }
    }

    private async fetchCurrentFields(): Promise<BxListFieldsGetResponse> {
        const response = await this.bitrix.list.getListFields(this.listAddress);
        return response.result ?? {};
    }

    private buildBatchCommands(existingFields: BxListFieldsGetResponse): void {
        for (const parseField of this.parseFields) {
            const existing = this.findExisting(existingFields, parseField);
            const payload = this.buildFieldPayload(parseField, existing);
            if (existing) {
                this.bitrix.batch.list.updateField(
                    parseField.code,
                    this.listAddress,
                    existing.fieldId,
                    payload,
                );
            } else {
                this.bitrix.batch.list.addField(
                    parseField.code,
                    this.listAddress,
                    payload,
                );
            }
        }
    }

    /**
     * Существующее поле ищется по кандидатам CODE: полный легаси-код
     * (`sales_kpi_crm_company`), btx-код шаблона (`CRM_COMPANY` — так
     * ошибочно писала ранняя версия), короткий код. Иначе на легаси-порталах
     * плодились дубликаты свойств.
     */
    private findExisting(
        existingFields: BxListFieldsGetResponse,
        parseField: Field,
    ): IBxListFieldRef | undefined {
        const candidates = listFieldCodeCandidates(this.listKey, parseField);
        for (const candidate of candidates) {
            for (const [fieldId, description] of Object.entries(
                existingFields,
            )) {
                if (
                    String(description.CODE ?? '').toUpperCase() === candidate
                ) {
                    return { fieldId, description };
                }
            }
        }
        return undefined;
    }

    private buildFieldPayload(
        parseField: Field,
        existing: IBxListFieldRef | undefined,
    ): IBXListFieldPayload {
        const mapping = mapParseTypeToListFieldType(parseField.type);
        const payload: IBXListFieldPayload = {
            NAME: parseField.name,
            // Полный легаси-код: и миграция ошибочно созданных CODE=EVENT_DATE
            CODE: fullListFieldCode(this.listKey, parseField.code),
            SORT: parseField.order,
            // Тип/множественность/обязательность существующего поля не трогаем:
            // TYPE Bitrix менять запрещает, а MULTIPLE/IS_REQUIRED могли быть
            // настроены на портале (ранее update перетирал множественность)
            IS_REQUIRED: existing
                ? (existing.description.IS_REQUIRED ?? 'N')
                : 'N',
            MULTIPLE: existing
                ? (existing.description.MULTIPLE ?? mapping.MULTIPLE)
                : mapping.MULTIPLE,
            TYPE: existing
                ? (existing.description.TYPE as IBXListFieldPayload['TYPE'])
                : mapping.TYPE,
        };
        if (parseField.type === 'enumeration') {
            payload.LIST = this.buildEnumListPayload(parseField, existing);
        }
        return payload;
    }

    /**
     * Полный набор значений enum-поля: шаблонные (существующие сохраняют id,
     * новые получают ключи n0, n1…) + существующие вне шаблона (сохраняются).
     */
    private buildEnumListPayload(
        parseField: Field,
        existing: IBxListFieldRef | undefined,
    ): BxListFieldListPayload {
        const existingValues = existing?.description.DISPLAY_VALUES_FORM ?? {};
        const payload: BxListFieldListPayload = {};
        const matchedIds = new Set<string>();
        let newIndex = 0;

        for (const item of parseField.list) {
            const existingId = Object.entries(existingValues).find(
                ([, value]) =>
                    this.alnumOnly(value) === this.alnumOnly(item.VALUE),
            )?.[0];
            const key = existingId ?? `n${newIndex++}`;
            if (existingId) {
                matchedIds.add(existingId);
            }
            payload[key] = {
                VALUE: item.VALUE,
                SORT: item.SORT,
                DEF: 'N',
            };
        }

        // Существующие в Bitrix значения вне шаблона не удаляем
        for (const [id, value] of Object.entries(existingValues)) {
            if (!matchedIds.has(id)) {
                payload[id] = { VALUE: value };
            }
        }

        return payload;
    }

    private prepareBatchResult(batchResponse: IBitrixBatchResponseResult[]): {
        errorCodes: string[];
        results: Array<{ code: string; result: string | number | boolean }>;
    } {
        const errorCodes: string[] = [];
        const results: Array<{
            code: string;
            result: string | number | boolean;
        }> = [];
        for (const response of batchResponse) {
            if (
                response.result_error &&
                typeof response.result_error === 'object'
            ) {
                Object.keys(response.result_error).forEach(key => {
                    errorCodes.push(key);
                });
            }
            if (response.result) {
                Object.keys(response.result).forEach(key => {
                    results.push({
                        code: key,
                        result: response.result[key] as
                            | string
                            | number
                            | boolean,
                    });
                });
            }
        }
        return { errorCodes, results };
    }

    private async getResult(
        errorCodes: string[],
        results: Array<{ code: string; result: string | number | boolean }>,
    ): Promise<IBxListFieldsInstallResult> {
        const fieldsAfterInstall = await this.fetchCurrentFields();
        const bxResultsWithParsed: IBxListInstalledFieldResult[] = [];

        for (const result of results) {
            const parsedField = this.parseFields.find(
                f => f.code === result.code,
            );
            if (!parsedField) {
                continue;
            }
            const bxField = this.findExisting(fieldsAfterInstall, parsedField);
            bxResultsWithParsed.push({ ...result, parsedField, bxField });
        }

        if (errorCodes.length > 0) {
            this.logger.warn(
                `List fields install on ${this.domain}: errors for [${errorCodes.join(', ')}]`,
            );
        }

        return {
            errorCodes,
            results: bxResultsWithParsed,
            countSuccess: bxResultsWithParsed.filter(r => r.bxField).length,
            countFailed:
                this.parseFields.length -
                bxResultsWithParsed.filter(r => r.bxField).length,
            countTotal: this.parseFields.length,
        };
    }

    /** Нормализация строки для сравнения значений (как в abstract-инсталлере) */
    private alnumOnly(s: string | undefined): string {
        if (!s) {
            return '';
        }
        return s
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '');
    }
}
