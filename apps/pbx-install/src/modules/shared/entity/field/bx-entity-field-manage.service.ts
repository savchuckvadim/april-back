import { PBXService } from '@/modules/pbx';
import {
    BitrixEnumerationOption,
    BitrixService,
    BxCompanyBatchService,
    BxCompanyService,
    BxContactBatchService,
    BxContactService,
    BxDealBatchService,
    BxDealService,
    BxLeadBatchService,
    BxLeadService,
    IBXField,
} from '@/modules/bitrix';
import { IBxEntityInstallType } from './bx-entity-field-install.service';

export interface BxFieldDeleteResult {
    code: string;
    bxFieldId: string | null;
    deleted: boolean;
    error?: string;
}

export interface BxFieldItemOperationResult {
    fieldCode: string;
    itemCode: string;
    bxFieldId: string | null;
    bxItemId: string | null;
    ok: boolean;
    error?: string;
}

/** Результат удаления полей сущности на одном портале (PortalDB + Bitrix). */
export interface PerPortalFieldDeleteResult {
    domain: string;
    portalId: number;
    bx: BxFieldDeleteResult[];
    deletedDbFieldIds: string[];
    notFoundCodes: string[];
}

/** Результат manage-операции над одним list-item полем сущности на одном портале. */
export interface PerPortalFieldItemResult {
    domain: string;
    portalId: number;
    bx: BxFieldItemOperationResult;
    db: { ok: boolean; itemId?: string; error?: string };
}

/**
 * Сервис для manage-операций над пользовательскими полями сущностей CRM в Bitrix.
 * Работает и для company, и для deal — выбор сущности по {@link IBxEntityInstallType}.
 *
 * Ничего не знает про PortalDB — только Bitrix.
 */
export class BxEntityFieldManageService {
    private bitrix!: BitrixService;
    private bxEntityService!:
        | BxCompanyService
        | BxContactService
        | BxDealService
        | BxLeadService;
    private bxEntityBatchService!:
        | BxCompanyBatchService
        | BxContactBatchService
        | BxDealBatchService
        | BxLeadBatchService;
    private readonly entity: IBxEntityInstallType;
    private readonly domain: string;
    private readonly pbxService: PBXService;

    constructor(
        domain: string,
        pbxService: PBXService,
        entity: IBxEntityInstallType,
    ) {
        this.domain = domain;
        this.entity = entity;
        this.pbxService = pbxService;
    }

    private async init() {
        const { bitrix } = await this.pbxService.init(this.domain);
        this.bitrix = bitrix;
        this.bxEntityService = this.bitrix[this.entity];
        this.bxEntityBatchService = this.bitrix.batch[this.entity];
        if (
            !this.bitrix ||
            !this.bxEntityService ||
            !this.bxEntityBatchService
        ) {
            throw new Error(
                `Bitrix service not found for entity: ${this.entity}`,
            );
        }
    }

    /**
     * Удаляет указанные пользовательские поля в Bitrix батчем.
     * Удаление поля в Bitrix автоматически удаляет связанные list-items.
     */
    public async deleteFields(
        bxFieldNames: { code: string; bxFieldName: string }[],
    ): Promise<BxFieldDeleteResult[]> {
        await this.init();
        const results: BxFieldDeleteResult[] = [];
        const existingBxFields = await this.getCurrentBxFields();

        const fieldsForBatch: {
            code: string;
            bxFieldId: string;
        }[] = [];

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
            this.bxEntityBatchService.deleteField(code, bxFieldId);
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
     * Удаляет один элемент enumeration-поля в Bitrix через USER_FIELD_UPDATE с `DEL: 'Y'`.
     *
     * Item адресуется напрямую по `bxItemId` (значение `bitrixfield_items.bitrixId` из PortalDB),
     * никаких поисков по VALUE/XML_ID в Bitrix не выполняется — это устраняет хрупкий
     * матчинг по имени и снимает зависимость от того, как item записан в Bitrix.
     */
    public async deleteFieldItem(
        bxFieldName: string,
        bxItemId: number,
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
        const listPayload = [
            { ID: String(bxItemId), DEL: 'Y' as const },
        ] as unknown as BitrixEnumerationOption[];
        try {
            await this.bxEntityService.updateField(bxField.ID, {
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

    /**
     * Обновляет VALUE одного элемента enumeration-поля в Bitrix.
     *
     * Item адресуется напрямую по `bxItemId` (значение `bitrixfield_items.bitrixId` из PortalDB).
     * Bitrix принимает минимальный payload `{ ID, VALUE }` — остальные поля item-а (XML_ID, SORT, DEF)
     * сохраняются.
     */
    public async editFieldItem(
        bxFieldName: string,
        bxItemId: number,
        newValue: string,
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
        const listPayload = [
            { ID: String(bxItemId), VALUE: newValue },
        ] as unknown as BitrixEnumerationOption[];
        try {
            await this.bxEntityService.updateField(bxField.ID, {
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
        const response = await this.bxEntityService.getFieldsList();
        return response.result;
    }

    private async getBxFieldByName(
        fullBxName: string,
    ): Promise<IBXField | null> {
        const response = await this.bxEntityService.getFieldsList({
            FIELD_NAME: fullBxName,
        });
        return response.result[0] ?? null;
    }

    private getBxFieldNameByParseName(parseName: string): string {
        if (parseName.startsWith('UF_CRM_')) {
            return parseName;
        }
        return `UF_CRM_${parseName}`;
    }
}
