import { PBXService } from '@/modules/pbx';
import { mapFieldTypeToBitrixType } from '@/modules/pbx-domain';
import {
    BitrixService,
    EUserFieldType,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { delay } from '@/shared';
import { Field, ListItem } from '../../parse-field-excel';
import {
    IBxTypedEntityFieldsInstallResult,
    IBxTypedFieldInstallResult,
    IBxTypedFieldWithParsedResult,
    TypedEntityFieldCtx,
} from './typed-entity-field.types';

/**
 * Установка полей «типизированной» сущности (smart-process / RPA) через `userfieldconfig.*`.
 * Идейно повторяет `BxEntityFieldsInstallService` (для DEAL/COMPANY/CONTACT через `crm.{entity}.userfield.*`),
 * но работает с другим Bitrix REST методом и с другим payload-shape (`IUserFieldConfig`).
 *
 * Контракт:
 * 1. Принимает уже распаршенные `Field[]` (источник Excel выбирает оркестратор).
 * 2. Резолвит `BitrixService` из домена через `PBXService.init`.
 * 3. Сравнивает шаблон с текущим состоянием `userfieldconfig.list({ entityId })`.
 * 4. На каждое шаблонное поле — batch-команду add/update (`userfieldconfig.addBtch/updateBtch`).
 * 5. Выполняет батч, прогоняет retry для упавших, повторно листает и собирает `bxField` для маппинга в БД портала.
 *
 * Этот сервис **ничего не знает про PortalDB** — только Bitrix.
 * За зеркало в `t_fields` отвечает `PortalFieldTypedEntityInstallService.syncWithDb`.
 */
const MAX_RETRY_COUNT = 0;
const RETRY_DELAY = 1000;

interface IBatchResult {
    errorCodes: string[];
    results: IBxTypedFieldInstallResult[];
}

export class BxTypedEntityFieldsInstallService {
    private bitrix!: BitrixService;
    private readonly domain: string;
    private readonly pbxService: PBXService;
    private readonly ctx: TypedEntityFieldCtx;
    private readonly parseFields: Field[];

    constructor(
        domain: string,
        pbxService: PBXService,
        ctx: TypedEntityFieldCtx,
        parseFields: Field[],
    ) {
        this.domain = domain;
        this.pbxService = pbxService;
        this.ctx = ctx;
        this.parseFields = parseFields;

    }

    private async init(): Promise<void> {
        const { bitrix } = await this.pbxService.init(this.domain);
        if (!bitrix) {
            throw new Error('Bitrix service not found for typed entity');
        }
        this.bitrix = bitrix;
    }

    public async installFields(): Promise<IBxTypedEntityFieldsInstallResult> {
        await this.init();
        const existingBxFields = await this.listCurrent();

        const errorCodes: string[] = [];
        const results: IBxTypedFieldInstallResult[] = [];

        this.enqueueBatch(this.parseFields, existingBxFields);
        const currentcommands = this.bitrix.api.getCmdBatch();
        console.log(currentcommands);

        const batchResponse = await this.bitrix.api.callBatchWithConcurrency(1);
        const { errorCodes: batchErrorCodes, results: batchResults } =
            this.prepareBatchResult(batchResponse);
        errorCodes.push(...batchErrorCodes);
        results.push(...batchResults);

        await this.retryBatch(errorCodes, results);
        return await this.collectFinalResult(errorCodes, results);
    }

    private async listCurrent(): Promise<IUserFieldConfig[]> {
        const listData = {
            moduleId: this.ctx.moduleId,
            filter: { entityId: this.ctx.bitrixEntityId },
        }
        const response = await this.bitrix.userFieldConfig.list(listData);
        const result = response.result as
            | { fields?: IUserFieldConfig[] }
            | undefined;
        return result?.fields ?? [];
    }

    private enqueueBatch(
        parseFields: Field[],
        existing: IUserFieldConfig[],
    ): void {
        for (const parseField of parseFields) {
            //is need update больше не используем если сюда пришло поле - работаем с ним
            // if (!parseField.isNeedUpdate) continue;
            const fieldName = this.buildBxFieldName(parseField.bxFieldName);
            const existingField = existing.find(f => f.fieldName === fieldName);
            const payload = this.buildPayload(parseField, fieldName, existingField);

            if (existingField?.id != null) {
                this.bitrix.batch.userFieldConfig.updateBtch(parseField.code, {
                    moduleId: this.ctx.moduleId,
                    id: existingField.id,
                    field: payload,
                });
            } else {
                this.bitrix.batch.userFieldConfig.addBtch(parseField.code, {
                    moduleId: this.ctx.moduleId,
                    field: payload,
                });
            }
        }
    }

    private buildPayload(
        parseField: Field,
        fieldName: string,
        existingField: IUserFieldConfig | undefined,
    ): Partial<IUserFieldConfig> {
        const bxType = mapFieldTypeToBitrixType(parseField.type);
        const payload: Partial<IUserFieldConfig> = {
            entityId: this.ctx.bitrixEntityId,
            fieldName,
            userTypeId: bxType,
            multiple: parseField.isMultiple ? 'Y' : 'N',
            mandatory: 'N',
            showFilter: 'Y',
            showInList: 'Y',
            editInList: 'Y',
            isSearchable: 'Y',
            sort: parseField.order,
            xmlId: parseField.code,
            editFormLabel: { ru: parseField.name },
            listColumnLabel: { ru: parseField.name },
            listFilterLabel: { ru: parseField.name },
        };
        if (bxType === EUserFieldType.ENUMERATION) {
            payload.enum = this.buildEnumPayload(
                parseField.list ?? [],
                existingField?.enum ?? [],
            );
        }
        return payload;
    }

    private buildEnumPayload(
        list: ListItem[],
        existingItems: IUserFieldConfigEnumerationItem[],
    ): IUserFieldConfigEnumerationItem[] {
        return list.map(item => {
            const existing = existingItems.find(e =>
                this.isSameEnumItem(e, item),
            );
            if (existing?.id != null) {
                // update item-а — Bitrix принимает частичный payload `{ id, value, sort, ... }`.
                return {
                    id: existing.id,
                    value: item.VALUE,
                    def: 'N',
                    sort: item.SORT,
                    xmlId: item.CODE,
                } as IUserFieldConfigEnumerationItem;
            }
            return {
                value: item.VALUE,
                def: 'N',
                sort: item.SORT,
                xmlId: item.CODE,
            } as IUserFieldConfigEnumerationItem;
        });
    }

    private isSameEnumItem(
        existing: IUserFieldConfigEnumerationItem,
        parsed: ListItem,
    ): boolean {
        return (
            this.alnumOnly(existing.value) === this.alnumOnly(parsed.VALUE) ||
            this.alnumOnly(existing.xmlId) === this.alnumOnly(parsed.CODE)
        );
    }

    private alnumOnly(s: unknown): string {
        return String(s ?? '')
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '');
    }

    private buildBxFieldName(parseName: string): string {
        const clean = parseName.replace(/^UF_CRM_/, '');
        return `${this.ctx.bxFieldNamePrefix}${clean}`;
    }

    private prepareBatchResult(
        batchResponse: IBitrixBatchResponseResult[],
    ): IBatchResult {
        const errorCodes: string[] = [];
        const results: IBxTypedFieldInstallResult[] = [];
        for (const response of batchResponse) {
            if (
                response.result_error &&
                typeof response.result_error === 'object'
            ) {
                Object.keys(response.result_error).forEach(k =>
                    errorCodes.push(k),
                );
            }
            if (response.result && typeof response.result === 'object') {
                const map = response.result as Record<string, unknown>;
                for (const key of Object.keys(map)) {
                    results.push({ code: key, result: map[key] });
                }
            }
        }
        return { errorCodes, results };
    }

    private async retryBatch(
        errorCodes: string[],
        results: IBxTypedFieldInstallResult[],
    ): Promise<void> {
        let retryCount = 0;
        while (errorCodes.length > 0 && retryCount < MAX_RETRY_COUNT) {
            await delay(RETRY_DELAY);
            const batchResponse =
                await this.bitrix.api.callBatchWithConcurrency(1);
            const { errorCodes: batchErrorCodes, results: batchResults } =
                this.prepareBatchResult(batchResponse);
            errorCodes.splice(
                0,
                errorCodes.length,
                ...batchErrorCodes,
            );
            results.push(...batchResults);
            retryCount++;
        }
    }

    private async collectFinalResult(
        errorCodes: string[],
        results: IBxTypedFieldInstallResult[],
    ): Promise<IBxTypedEntityFieldsInstallResult> {
        const currentAfter = await this.listCurrent();
        const out: IBxTypedFieldWithParsedResult[] = [];
        for (const r of results) {
            const parsedField = this.parseFields.find(f => f.code === r.code);
            if (!parsedField) continue;
            const expectedFieldName = this.buildBxFieldName(
                parsedField.bxFieldName,
            );
            const bxField = currentAfter.find(
                f => f.fieldName === expectedFieldName,
            );
            out.push({ ...r, parsedField, bxField });
        }
        return {
            errorCodes,
            results: out,
            countSuccess: out.filter(r => r.bxField !== undefined).length,
            countFailed:
                results.length -
                out.filter(r => r.bxField !== undefined).length,
            countTotal: this.parseFields.length || 0,
        };
    }
}
