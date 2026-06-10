import { BxUserBatchService, IBXField } from '@/modules/bitrix';
import { Field } from '../../parse-field-excel';
import { AbstractBxFieldsInstallService } from './abstract-bx-fields-install.service';

/** Префикс пользовательских полей пользователя в Bitrix. */
export const USER_FIELD_PREFIX = 'UF_USR_';

/**
 * Установка пользовательских полей ПОЛЬЗОВАТЕЛЯ в Bitrix (user.userfield.*).
 *
 * Особенности:
 * - префикс UF_USR_;
 * - enumeration поддерживается (LIST);
 * - результат позднее синхронизируется с PortalDB (сущность USER).
 */
export class BxUserFieldsInstallService extends AbstractBxFieldsInstallService {
    private userBatch!: BxUserBatchService;

    protected getFieldPrefix(): string {
        return USER_FIELD_PREFIX;
    }

    protected initEntityServices(): void {
        this.userBatch = this.bitrix.batch.user;
        if (!this.bitrix.user || !this.userBatch) {
            throw new Error('Bitrix user service not found');
        }
    }

    protected async fetchCurrentBxFields(): Promise<IBXField[]> {
        const { result } = await this.bitrix.user.listFields();
        return (result ?? []) as unknown as IBXField[];
    }

    protected enqueueAdd(parseField: Field, fullFieldName: string): void {
        this.userBatch.addUserField(
            parseField.code,
            this.buildFieldData(parseField, fullFieldName),
        );
    }

    protected enqueueUpdate(
        parseField: Field,
        fullFieldName: string,
        existing: IBXField,
    ): void {
        this.userBatch.updateUserField(
            parseField.code,
            existing.ID,
            this.buildFieldData(parseField, fullFieldName, existing),
        );
    }

    private buildFieldData(
        parseField: Field,
        fullFieldName: string,
        existing?: IBXField,
    ): Partial<IBXField> {
        const fieldData: Partial<IBXField> = {
            LABEL: parseField.name,
            EDIT_FORM_LABEL: { ru: parseField.name },
            LIST_COLUMN_LABEL: { ru: parseField.name },
            LIST_FILTER_LABEL: { ru: parseField.name },
            FIELD_NAME: fullFieldName,
            USER_TYPE_ID: this.mapType(parseField),
            SORT: String(parseField.order),
            MULTIPLE: parseField.isMultiple ? 'Y' : 'N',
            MANDATORY: 'N',
            SHOW_FILTER: 'Y',
            XML_ID: parseField.code,
        };
        if (parseField.type === 'enumeration') {
            fieldData.LIST = this.buildEnumList(
                parseField.list || [],
                existing?.LIST || [],
            );
        }
        return fieldData;
    }
}
