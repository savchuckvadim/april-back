import { PBXService } from '@/modules/pbx';
import {
    BitrixService,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';
import { TypedEntityFieldCtx } from './typed-entity-field.types';

export interface BxTypedFieldDeleteResult {
    code: string;
    bxFieldId: string | null;
    deleted: boolean;
    error?: string;
}

export interface BxTypedFieldItemOperationResult {
    fieldCode: string;
    itemCode: string;
    bxFieldId: string | null;
    bxItemId: string | null;
    ok: boolean;
    error?: string;
}

/**
 * Manage-операции над полями «типизированной» сущности (smart-process / RPA) в Bitrix через `userfieldconfig.*`.
 * Зеркало `BxEntityFieldManageService` для DEAL/COMPANY/CONTACT, только адресуется через `entityId` из ctx.
 *
 * Ничего не знает про PortalDB — только Bitrix.
 */
export class BxTypedEntityFieldManageService {
    private bitrix!: BitrixService;
    private readonly domain: string;
    private readonly pbxService: PBXService;
    private readonly ctx: TypedEntityFieldCtx;

    constructor(domain: string, pbxService: PBXService, ctx: TypedEntityFieldCtx) {
        this.domain = domain;
        this.pbxService = pbxService;
        this.ctx = ctx;
    }

    private async init(): Promise<void> {
        const { bitrix } = await this.pbxService.init(this.domain);
        if (!bitrix) {
            throw new Error('Bitrix service not found for typed entity');
        }
        this.bitrix = bitrix;
    }

    /**
     * Удаляет указанные поля одним батчем `userfieldconfig.delete`.
     * Bitrix вместе с полем удаляет и связанные enum-items.
     */
    public async deleteFields(
        bxFieldNames: { code: string; bxFieldName: string }[],
    ): Promise<BxTypedFieldDeleteResult[]> {
        await this.init();
        const results: BxTypedFieldDeleteResult[] = [];
        const existing = await this.listCurrent();

        const fieldsForBatch: { code: string; bxFieldId: string }[] = [];
        for (const { code, bxFieldName } of bxFieldNames) {
            const fullName = this.buildBxFieldName(bxFieldName);
            const bxField = existing.find(f => f.fieldName === fullName);
            if (!bxField?.id) {
                results.push({
                    code,
                    bxFieldId: null,
                    deleted: false,
                    error: 'field not found in Bitrix',
                });
                continue;
            }
            fieldsForBatch.push({ code, bxFieldId: String(bxField.id) });
        }

        for (const { code, bxFieldId } of fieldsForBatch) {
            this.bitrix.batch.userFieldConfig.deleteBtch(code, {
                moduleId: this.ctx.moduleId,
                id: bxFieldId,
            });
        }

        if (fieldsForBatch.length > 0) {
            const batchResponse =
                await this.bitrix.api.callBatchWithConcurrency(1);
            const errorCodes = new Set<string>();
            for (const response of batchResponse) {
                if (
                    response.result_error &&
                    typeof response.result_error === 'object'
                ) {
                    Object.keys(response.result_error).forEach(k =>
                        errorCodes.add(k),
                    );
                }
            }
            for (const { code, bxFieldId } of fieldsForBatch) {
                results.push({
                    code,
                    bxFieldId,
                    deleted: !errorCodes.has(code),
                    error: errorCodes.has(code) ? 'bitrix batch error' : undefined,
                });
            }
        }

        return results;
    }

    /**
     * Удаляет один enum-item через `userfieldconfig.update({ field: { enum: [{ id, del: 'Y' }] } })`.
     * Адресуется по `bxItemId` (`bitrixfield_items.bitrixId` из PortalDB).
     */
    public async deleteFieldItem(
        bxFieldName: string,
        bxItemId: number,
        meta: { fieldCode: string; itemCode: string },
    ): Promise<BxTypedFieldItemOperationResult> {
        await this.init();
        const bxField = await this.findByFieldName(bxFieldName);
        if (!bxField) {
            return this.notFound(meta, bxItemId, 'field not found in Bitrix');
        }
        const enumPatch = [
            { id: String(bxItemId), del: 'Y' as const },
        ] as unknown as IUserFieldConfigEnumerationItem[];
        try {
            await this.bitrix.userFieldConfig.update({
                moduleId: this.ctx.moduleId,
                id: bxField.id!,
                field: { enum: enumPatch },
            });
            return {
                fieldCode: meta.fieldCode,
                itemCode: meta.itemCode,
                bxFieldId: String(bxField.id),
                bxItemId: String(bxItemId),
                ok: true,
            };
        } catch (e) {
            return {
                fieldCode: meta.fieldCode,
                itemCode: meta.itemCode,
                bxFieldId: String(bxField.id),
                bxItemId: String(bxItemId),
                ok: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
     * Обновляет `value` одного enum-item через `userfieldconfig.update({ field: { enum: [{ id, value }] } })`.
     */
    public async editFieldItem(
        bxFieldName: string,
        bxItemId: number,
        newValue: string,
        meta: { fieldCode: string; itemCode: string },
    ): Promise<BxTypedFieldItemOperationResult> {
        await this.init();
        const bxField = await this.findByFieldName(bxFieldName);
        if (!bxField) {
            return this.notFound(meta, bxItemId, 'field not found in Bitrix');
        }
        const enumPatch = [
            { id: String(bxItemId), value: newValue },
        ] as unknown as IUserFieldConfigEnumerationItem[];
        try {
            await this.bitrix.userFieldConfig.update({
                moduleId: this.ctx.moduleId,
                id: bxField.id!,
                field: { enum: enumPatch },
            });
            return {
                fieldCode: meta.fieldCode,
                itemCode: meta.itemCode,
                bxFieldId: String(bxField.id),
                bxItemId: String(bxItemId),
                ok: true,
            };
        } catch (e) {
            return {
                fieldCode: meta.fieldCode,
                itemCode: meta.itemCode,
                bxFieldId: String(bxField.id),
                bxItemId: String(bxItemId),
                ok: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    private async listCurrent(): Promise<IUserFieldConfig[]> {
        const response = await this.bitrix.userFieldConfig.list({
            moduleId: this.ctx.moduleId,
            filter: { entityId: this.ctx.bitrixEntityId },
        });
        const result = response.result as
            | { fields?: IUserFieldConfig[] }
            | undefined;
        return result?.fields ?? [];
    }

    private async findByFieldName(
        bxFieldName: string,
    ): Promise<IUserFieldConfig | null> {
        const fullName = this.buildBxFieldName(bxFieldName);
        const list = await this.listCurrent();
        return list.find(f => f.fieldName === fullName) ?? null;
    }

    private buildBxFieldName(parseName: string): string {
        if (parseName.startsWith(this.ctx.bxFieldNamePrefix)) {
            return parseName;
        }
        const clean = parseName.replace(/^UF_CRM_/, '');
        return `${this.ctx.bxFieldNamePrefix}${clean}`;
    }

    private notFound(
        meta: { fieldCode: string; itemCode: string },
        bxItemId: number,
        error: string,
    ): BxTypedFieldItemOperationResult {
        return {
            fieldCode: meta.fieldCode,
            itemCode: meta.itemCode,
            bxFieldId: null,
            bxItemId: String(bxItemId),
            ok: false,
            error,
        };
    }
}
