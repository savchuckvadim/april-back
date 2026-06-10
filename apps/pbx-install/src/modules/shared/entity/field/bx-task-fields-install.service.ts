import {
    BxTaskUserFieldBatchService,
    ETaskUserFieldType,
    IBXField,
    ITaskUserFieldParams,
} from '@/modules/bitrix';
import { Field } from '../../parse-field-excel';
import { AbstractBxFieldsInstallService } from './abstract-bx-fields-install.service';

/** Префикс пользовательских полей задачи в Bitrix. */
export const TASK_FIELD_PREFIX = 'UF_TASK_';

/** Типы, поддерживаемые task.item.userfield (enumeration не поддерживается). */
const ALLOWED_TASK_TYPES: ETaskUserFieldType[] = [
    ETaskUserFieldType.STRING,
    ETaskUserFieldType.DOUBLE,
    ETaskUserFieldType.DATETIME,
    ETaskUserFieldType.BOOLEAN,
];

/**
 * Установка пользовательских полей ЗАДАЧИ в Bitrix (task.item.userfield.*).
 *
 * Особенности:
 * - префикс UF_TASK_;
 * - нет enumeration-полей;
 * - payload в формате PARAMS;
 * - синхронизация с PortalDB не выполняется (в БД нет сущности task).
 */
export class BxTaskFieldsInstallService extends AbstractBxFieldsInstallService {
    private taskBatch!: BxTaskUserFieldBatchService;

    protected getFieldPrefix(): string {
        return TASK_FIELD_PREFIX;
    }

    protected supportsEnumeration(): boolean {
        return false;
    }

    protected initEntityServices(): void {
        this.taskBatch = this.bitrix.batch.taskUserField;
        if (!this.bitrix.taskUserField || !this.taskBatch) {
            throw new Error('Bitrix task user-field service not found');
        }
    }

    protected async fetchCurrentBxFields(): Promise<IBXField[]> {
        const { result } = await this.bitrix.taskUserField.getList({
            SORT: 'ASC',
        });
        return (result ?? []) as unknown as IBXField[];
    }

    protected enqueueAdd(parseField: Field, fullFieldName: string): void {
        this.taskBatch.addBtch(
            parseField.code,
            this.buildParams(parseField, fullFieldName),
        );
    }

    protected enqueueUpdate(
        parseField: Field,
        fullFieldName: string,
        existing: IBXField,
    ): void {
        this.taskBatch.updateBtch(
            parseField.code,
            existing.ID,
            this.buildParams(parseField, fullFieldName),
        );
    }

    private buildParams(
        parseField: Field,
        fullFieldName: string,
    ): ITaskUserFieldParams {
        const userTypeId = this.resolveTaskType(parseField);
        const params: ITaskUserFieldParams = {
            USER_TYPE_ID: userTypeId,
            FIELD_NAME: fullFieldName,
            XML_ID: parseField.code,
            LABEL: parseField.name,
            EDIT_FORM_LABEL: { ru: parseField.name },
            SORT: String(parseField.order),
            MULTIPLE: parseField.isMultiple ? 'Y' : 'N',
            MANDATORY: 'N',
        };
        // строковые поля-комментарии делаем многострочными
        if (userTypeId === ETaskUserFieldType.STRING) {
            params.SETTINGS = { ROWS: 5 };
        }
        return params;
    }

    private resolveTaskType(parseField: Field): ETaskUserFieldType {
        const mapped = this.mapType(parseField) as ETaskUserFieldType;
        return ALLOWED_TASK_TYPES.includes(mapped)
            ? mapped
            : ETaskUserFieldType.STRING;
    }
}
