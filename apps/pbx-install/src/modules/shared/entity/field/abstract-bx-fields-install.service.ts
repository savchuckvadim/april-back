import { PBXService } from '@/modules/pbx';
import { mapFieldTypeToBitrixType } from '@lib/portal-lib/pbx-domain';
import {
    BitrixEnumerationOption,
    BitrixService,
    IBXField,
} from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { Field, ListItem, ListItemDto } from '../../parse-field-excel';

interface IBxFieldInstallResult {
    code: string;
    result: number | boolean;
}
export interface IBxInstalledFieldResult extends IBxFieldInstallResult {
    parsedField: Field;
    bxField: IBXField | undefined;
}
interface IBatchResult {
    errorCodes: string[];
    results: IBxFieldInstallResult[];
}
export interface IBxFieldsInstallResult {
    errorCodes: string[];
    results: IBxInstalledFieldResult[];
    countSuccess: number;
    countFailed: number;
    countTotal: number;
}

/**
 * Базовый сервис установки пользовательских полей в Bitrix.
 *
 * Инкапсулирует общий каркас (не привязанный к конкретной сущности):
 * init по domain → получить текущие поля → собрать batch (add/update) →
 * выполнить batch → разобрать результат → смержить с parsed-полями.
 *
 * Сущность-специфичную часть (префикс UF_, какие batch-методы вызывать,
 * как получить текущие поля, поддержка enumeration) реализуют наследники
 * ({@link BxTaskFieldsInstallService}, {@link BxUserFieldsInstallService}).
 *
 * НЕ `@Injectable()` — создаётся через `new` в use-case с конкретным
 * инстансом Bitrix (см. правила в CLAUDE.md про race condition с this.bitrix).
 */
export abstract class AbstractBxFieldsInstallService {
    protected bitrix!: BitrixService;
    protected readonly domain: string;
    protected readonly pbxService: PBXService;
    protected readonly parseFields: Field[];

    constructor(domain: string, pbxService: PBXService, parseFields: Field[]) {
        this.domain = domain;
        this.pbxService = pbxService;
        this.parseFields = parseFields;
    }

    /** Префикс имени UF-поля сущности (UF_TASK_ / UF_USR_ / ...). */
    protected abstract getFieldPrefix(): string;
    /** Инициализация сущность-специфичных сервисов после получения this.bitrix. */
    protected abstract initEntityServices(): void;
    /** Получает текущие пользовательские поля сущности из Bitrix. */
    protected abstract fetchCurrentBxFields(): Promise<IBXField[]>;
    /** Ставит в batch команду создания поля. cmdCode = parseField.code. */
    protected abstract enqueueAdd(
        parseField: Field,
        fullFieldName: string,
    ): void;
    /** Ставит в batch команду обновления поля. cmdCode = parseField.code. */
    protected abstract enqueueUpdate(
        parseField: Field,
        fullFieldName: string,
        existing: IBXField,
    ): void;
    /** Поддерживает ли сущность enumeration-поля (списки). */
    protected supportsEnumeration(): boolean {
        return true;
    }

    public async installBxFields(): Promise<IBxFieldsInstallResult> {
        await this.init();
        const existingBxFields = await this.fetchCurrentBxFields();

        const errorCodes: string[] = [];
        const results: IBxFieldInstallResult[] = [];

        this.buildBatchCommands(this.parseFields, existingBxFields);

        const batchResponse = await this.bitrix.api.callBatchWithConcurrency(1);
        const { errorCodes: batchErrorCodes, results: batchResults } =
            this.prepareBatchResult(batchResponse);
        errorCodes.push(...batchErrorCodes);
        results.push(...batchResults);

        return await this.getResult(errorCodes, results);
    }

    private async init(): Promise<void> {
        const { bitrix } = await this.pbxService.init(this.domain);
        this.bitrix = bitrix;
        if (!this.bitrix) {
            throw new Error('Bitrix service not found');
        }
        this.initEntityServices();
    }

    private buildBatchCommands(
        parseFields: Field[],
        existingBxFields: IBXField[],
    ): void {
        for (const parseField of parseFields) {
            const fullFieldName = this.getFullFieldName(parseField);
            const existing = existingBxFields.find(
                f => f.FIELD_NAME === fullFieldName,
            );
            if (existing) {
                this.enqueueUpdate(parseField, fullFieldName, existing);
            } else {
                this.enqueueAdd(parseField, fullFieldName);
            }
        }
    }

    private async getResult(
        errorCodes: string[],
        results: IBxFieldInstallResult[],
    ): Promise<IBxFieldsInstallResult> {
        const bxResultsWithParsed: IBxInstalledFieldResult[] = [];
        const currentFieldsAfterInstall = await this.fetchCurrentBxFields();
        for (const result of results) {
            const parsedField = this.parseFields.find(
                f => f.code === result.code,
            );
            if (!parsedField) {
                continue;
            }
            const fullFieldName = this.getFullFieldName(parsedField);
            const bxField = currentFieldsAfterInstall.find(
                f => f.FIELD_NAME === fullFieldName,
            );
            bxResultsWithParsed.push({ ...result, bxField, parsedField });
        }

        return {
            errorCodes,
            results: bxResultsWithParsed,
            countSuccess: bxResultsWithParsed.length,
            countFailed: results.length - bxResultsWithParsed.length,
            countTotal: this.parseFields.length || 0,
        };
    }

    private prepareBatchResult(
        batchResponse: IBitrixBatchResponseResult[],
    ): IBatchResult {
        const errorCodes: string[] = [];
        const results: IBxFieldInstallResult[] = [];
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
                        result: response.result[key] as number | boolean,
                    });
                });
            }
        }
        return { errorCodes, results };
    }

    /** Полное имя UF-поля в Bitrix (префикс + bxFieldName из parsed). */
    protected getFullFieldName(parseField: Field): string {
        const name = parseField.bxFieldName;
        const prefix = this.getFieldPrefix();
        return name.startsWith(prefix) ? name : `${prefix}${name}`;
    }

    /** Bitrix-тип поля по parsed-типу. */
    protected mapType(parseField: Field): string {
        return mapFieldTypeToBitrixType(parseField.type);
    }

    /**
     * Готовит LIST для enumeration-поля: сопоставляет parsed-значения с
     * существующими в Bitrix (по VALUE/XML_ID), сохраняя ID для обновления.
     */
    protected buildEnumList(
        list: ListItemDto[],
        bitrixList?: BitrixEnumerationOption[],
    ): BitrixEnumerationOption[] {
        const result: BitrixEnumerationOption[] = [];
        list.forEach(item => {
            const bitrixItem = bitrixList?.find(f =>
                this.compareItems(f, item),
            );
            const data: Partial<BitrixEnumerationOption> = {
                SORT: String(item.SORT),
                VALUE: item.VALUE,
                DEF: 'N',
            };
            if (!bitrixItem) {
                data.XML_ID = item.CODE;
            } else {
                data.ID = bitrixItem.ID;
            }
            result.push(data as BitrixEnumerationOption);
        });
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
            .replace(/[^\p{L}\p{N}]+/gu, '');
    }
}
