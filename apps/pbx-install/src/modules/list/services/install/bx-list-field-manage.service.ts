import { Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    BitrixService,
    BxListAddressInput,
    BxListFieldListPayload,
    IBXListFieldDescription,
    IBXListFieldPayload,
} from '@/modules/bitrix';
import {
    BxFieldDeleteResult,
    BxFieldItemOperationResult,
} from '@app/pbx-install/shared';

/**
 * Manage-операции над полями универсального списка в Bitrix.
 *
 * Поле адресуется FIELD_ID (= bitrixCamelId из PortalDB, формат PROPERTY_N).
 * Item-операции над enum-полями делаются через lists.field.update:
 * LIST — полный набор значений, поэтому текущие значения читаются из Bitrix
 * и отправляются целиком (с правкой/без удаляемого значения).
 *
 * Ничего не знает про PortalDB — только Bitrix.
 * НЕ `@Injectable()` — создаётся через `new` в use-case.
 */
export class BxListFieldManageService {
    private readonly logger = new Logger(BxListFieldManageService.name);
    private bitrix!: BitrixService;

    constructor(
        private readonly domain: string,
        private readonly pbxService: PBXService,
        private readonly listAddress: BxListAddressInput,
    ) {}

    async deleteFields(
        fields: Array<{ code: string; bxFieldId: string }>,
    ): Promise<BxFieldDeleteResult[]> {
        await this.init();
        const results: BxFieldDeleteResult[] = [];
        for (const field of fields) {
            try {
                const response = await this.bitrix.list.deleteField(
                    this.listAddress,
                    field.bxFieldId,
                );
                results.push({
                    code: field.code,
                    bxFieldId: field.bxFieldId,
                    deleted: Boolean(response.result),
                });
            } catch (e) {
                this.logger.warn(
                    `deleteField ${field.bxFieldId} failed on ${this.domain}: ${String(e)}`,
                );
                results.push({
                    code: field.code,
                    bxFieldId: field.bxFieldId,
                    deleted: false,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
        return results;
    }

    async deleteFieldItem(
        bxFieldId: string,
        bxItemId: number,
        ctx: { fieldCode: string; itemCode: string },
    ): Promise<BxFieldItemOperationResult> {
        return await this.updateFieldItems(
            bxFieldId,
            { ...ctx, bxItemId },
            values => {
                const key = String(bxItemId);
                if (!(key in values)) {
                    return null;
                }
                const rest = { ...values };
                delete rest[key];
                return rest;
            },
        );
    }

    async editFieldItem(
        bxFieldId: string,
        bxItemId: number,
        newValue: string,
        ctx: { fieldCode: string; itemCode: string },
    ): Promise<BxFieldItemOperationResult> {
        return await this.updateFieldItems(
            bxFieldId,
            { ...ctx, bxItemId },
            values => {
                const key = String(bxItemId);
                if (!(key in values)) {
                    return null;
                }
                return { ...values, [key]: newValue };
            },
        );
    }

    /**
     * Общий каркас item-операции: прочитать поле → преобразовать полный набор
     * значений → отправить lists.field.update. transform возвращает null,
     * если item в Bitrix не найден.
     */
    private async updateFieldItems(
        bxFieldId: string,
        ctx: { fieldCode: string; itemCode: string; bxItemId: number },
        transform: (
            values: Record<string, string>,
        ) => Record<string, string> | null,
    ): Promise<BxFieldItemOperationResult> {
        await this.init();
        try {
            const field = await this.fetchField(bxFieldId);
            if (!field) {
                return {
                    fieldCode: ctx.fieldCode,
                    itemCode: ctx.itemCode,
                    bxFieldId,
                    bxItemId: null,
                    ok: false,
                    error: 'field not found in Bitrix',
                };
            }
            const currentValues = field.DISPLAY_VALUES_FORM ?? {};
            const nextValues = transform(currentValues);
            if (nextValues === null) {
                return {
                    fieldCode: ctx.fieldCode,
                    itemCode: ctx.itemCode,
                    bxFieldId,
                    bxItemId: null,
                    ok: false,
                    error: 'list item not found in Bitrix field',
                };
            }
            const listPayload: BxListFieldListPayload = {};
            Object.entries(nextValues).forEach(([id, value]) => {
                listPayload[id] = { VALUE: value };
            });
            const response = await this.bitrix.list.updateField(
                this.listAddress,
                bxFieldId,
                {
                    NAME: field.NAME,
                    TYPE: field.TYPE as IBXListFieldPayload['TYPE'],
                    LIST: listPayload,
                },
            );
            return {
                fieldCode: ctx.fieldCode,
                itemCode: ctx.itemCode,
                bxFieldId,
                bxItemId: String(ctx.bxItemId),
                ok: Boolean(response.result),
            };
        } catch (e) {
            this.logger.warn(
                `field item op ${bxFieldId} failed on ${this.domain}: ${String(e)}`,
            );
            return {
                fieldCode: ctx.fieldCode,
                itemCode: ctx.itemCode,
                bxFieldId,
                bxItemId: null,
                ok: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    private async fetchField(
        bxFieldId: string,
    ): Promise<IBXListFieldDescription | undefined> {
        const response = await this.bitrix.list.getListField(
            this.listAddress,
            bxFieldId,
        );
        const fields = response.result ?? {};
        return fields[bxFieldId];
    }

    private async init(): Promise<void> {
        if (this.bitrix) {
            return;
        }
        const { bitrix } = await this.pbxService.init(this.domain);
        this.bitrix = bitrix;
    }
}
