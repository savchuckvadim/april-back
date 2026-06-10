import { PBXService } from '@/modules/pbx';
import {
    BitrixService,
    BxTaskUserFieldBatchService,
    IBXField,
} from '@/modules/bitrix';
import { BxFieldDeleteResult } from './bx-entity-field-manage.service';
import { TASK_FIELD_PREFIX } from './bx-task-fields-install.service';

/**
 * Manage-операции над пользовательскими полями ЗАДАЧИ в Bitrix.
 *
 * Только Bitrix (в PortalDB нет сущности task). Поддерживает удаление полей.
 * Item-операции (enumeration) не поддерживаются — у task-полей нет списков.
 *
 * НЕ `@Injectable()` — создаётся через `new` с конкретным инстансом Bitrix.
 */
export class BxTaskFieldManageService {
    private bitrix!: BitrixService;
    private taskBatch!: BxTaskUserFieldBatchService;
    private readonly domain: string;
    private readonly pbxService: PBXService;

    constructor(domain: string, pbxService: PBXService) {
        this.domain = domain;
        this.pbxService = pbxService;
    }

    private async init(): Promise<void> {
        const { bitrix } = await this.pbxService.init(this.domain);
        this.bitrix = bitrix;
        this.taskBatch = bitrix?.batch.taskUserField;
        if (!this.bitrix || !this.bitrix.taskUserField || !this.taskBatch) {
            throw new Error('Bitrix task user-field service not found');
        }
    }

    /**
     * Удаляет указанные пользовательские поля задачи в Bitrix батчем.
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
            this.taskBatch.deleteBtch(code, bxFieldId);
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

    private async getCurrentBxFields(): Promise<IBXField[]> {
        const { result } = await this.bitrix.taskUserField.getList({
            SORT: 'ASC',
        });
        return (result ?? []) as unknown as IBXField[];
    }

    private getBxFieldNameByParseName(parseName: string): string {
        return parseName.startsWith(TASK_FIELD_PREFIX)
            ? parseName
            : `${TASK_FIELD_PREFIX}${parseName}`;
    }
}
