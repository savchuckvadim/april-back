import { PBXService } from '@/modules/pbx';
import {
    BitrixEnumerationOption,
    BitrixService,
    BxUserBatchService,
    IBXField,
} from '@/modules/bitrix';
import {
    BxFieldDeleteResult,
    BxFieldItemOperationResult,
} from './bx-entity-field-manage.service';
import { USER_FIELD_PREFIX } from './bx-user-fields-install.service';

/**
 * Manage-операции над пользовательскими полями ПОЛЬЗОВАТЕЛЯ в Bitrix
 * (user.userfield.*). Ничего не знает про PortalDB — только Bitrix.
 *
 * НЕ `@Injectable()` — создаётся через `new` с конкретным инстансом Bitrix.
 */
export class BxUserFieldManageService {
    private bitrix!: BitrixService;
    private userBatch!: BxUserBatchService;
    private readonly domain: string;
    private readonly pbxService: PBXService;

    constructor(domain: string, pbxService: PBXService) {
        this.domain = domain;
        this.pbxService = pbxService;
    }

    private async init(): Promise<void> {
        const { bitrix } = await this.pbxService.init(this.domain);
        this.bitrix = bitrix;
        this.userBatch = bitrix?.batch.user;
        if (!this.bitrix || !this.bitrix.user || !this.userBatch) {
            throw new Error('Bitrix user service not found');
        }
    }

    /**
     * Удаляет указанные пользовательские поля пользователя в Bitrix батчем.
     */
    public async deleteFields(
        bxFieldNames: { code: string; bxFieldName: string }[],
    ): Promise<BxFieldDeleteResult[]> {
        await this.init();
        const results: BxFieldDeleteResult[] = [];
        const existingBxFields = await this.getCurrentBxFields();

        const fieldsForBatch: { code: string; bxFieldId: string }[] = [];
        for (const { code, bxFieldName } of bxFieldNames) {
            const bxField = existingBxFields.find(
                f =>
                    f.FIELD_NAME ===
                    this.getBxFieldNameByParseName(bxFieldName),
            );
            if (!bxField) {
                results.push({
                    code,
                    bxFieldId: null,
                    deleted: false,
                    error: 'field not found in Bitrix',
                });
                continue;
            }
            fieldsForBatch.push({ code, bxFieldId: bxField.ID });
        }

        for (const { code, bxFieldId } of fieldsForBatch) {
            this.userBatch.deleteUserField(code, bxFieldId);
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
                    error: errorCodes.has(code)
                        ? 'bitrix batch error'
                        : undefined,
                });
            }
        }

        return results;
    }

    /**
     * Удаляет один элемент enumeration-поля в Bitrix (LIST с DEL:'Y'),
     * адресуясь напрямую по `bxItemId` (bitrixfield_items.bitrixId из PortalDB).
     */
    public async deleteFieldItem(
        bxFieldName: string,
        bxItemId: number,
        meta: { fieldCode: string; itemCode: string },
    ): Promise<BxFieldItemOperationResult> {
        return await this.updateItem(
            bxFieldName,
            bxItemId,
            { ID: String(bxItemId), DEL: 'Y' as const },
            meta,
        );
    }

    /**
     * Обновляет VALUE одного элемента enumeration-поля в Bitrix.
     */
    public async editFieldItem(
        bxFieldName: string,
        bxItemId: number,
        newValue: string,
        meta: { fieldCode: string; itemCode: string },
    ): Promise<BxFieldItemOperationResult> {
        return await this.updateItem(
            bxFieldName,
            bxItemId,
            { ID: String(bxItemId), VALUE: newValue },
            meta,
        );
    }

    private async updateItem(
        bxFieldName: string,
        bxItemId: number,
        listItem: Record<string, string>,
        meta: { fieldCode: string; itemCode: string },
    ): Promise<BxFieldItemOperationResult> {
        await this.init();
        const fullBxName = this.getBxFieldNameByParseName(bxFieldName);
        const bxField = await this.getBxFieldByName(fullBxName);
        if (!bxField) {
            return {
                fieldCode: meta.fieldCode,
                itemCode: meta.itemCode,
                bxFieldId: null,
                bxItemId: String(bxItemId),
                ok: false,
                error: 'field not found in Bitrix',
            };
        }
        const listPayload = [listItem] as unknown as BitrixEnumerationOption[];
        try {
            await this.bitrix.user.updateUserField(bxField.ID, {
                LIST: listPayload,
            });
            return {
                fieldCode: meta.fieldCode,
                itemCode: meta.itemCode,
                bxFieldId: bxField.ID,
                bxItemId: String(bxItemId),
                ok: true,
            };
        } catch (e) {
            return {
                fieldCode: meta.fieldCode,
                itemCode: meta.itemCode,
                bxFieldId: bxField.ID,
                bxItemId: String(bxItemId),
                ok: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    private async getCurrentBxFields(): Promise<IBXField[]> {
        const { result } = await this.bitrix.user.listFields();
        return (result ?? []) as unknown as IBXField[];
    }

    private async getBxFieldByName(
        fullBxName: string,
    ): Promise<IBXField | null> {
        const fields = await this.getCurrentBxFields();
        return fields.find(f => f.FIELD_NAME === fullBxName) ?? null;
    }

    private getBxFieldNameByParseName(parseName: string): string {
        return parseName.startsWith(USER_FIELD_PREFIX)
            ? parseName
            : `${USER_FIELD_PREFIX}${parseName}`;
    }
}
