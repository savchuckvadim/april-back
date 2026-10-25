import { Injectable } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix/bitrix.service';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { CustomField } from '../../../types/bx-custom-field.type';
import { BXRequisiteDTO } from '../../../types/bx-requisite-dto.type';
import {
    isCustomField,
    createCustomFieldInfoCommand,
    createCustomFieldValueCommand,
    processCustomFieldResult,
    addCustomFieldIfNotExists,
    RawCustomFieldResult,
} from '../utils/custom-field.utils';

/**
 * Сервис для работы с пользовательскими полями реквизитов
 */
@Injectable()
export class BxRqCustomFieldService {
    /**
     * Добавляет batch команды для получения пользовательских полей
     */
    addCustomFieldsBatchCommands(
        bitrix: BitrixService,
        requisite: BXRequisiteDTO,
    ): Array<{ key: string; value: unknown }> {
        const rqCommands: Array<{ key: string; value: unknown }> = [];

        for (const [key, value] of Object.entries(requisite)) {
            if (!isCustomField(key)) continue;

            const fieldInfoCmd = createCustomFieldInfoCommand(key);
            const fieldValueCmd = createCustomFieldValueCommand(key);

            // Получаем информацию о поле
            bitrix.api.addCmdBatch(
                fieldInfoCmd,
                'crm.requisite.userfield.list',
                {
                    filter: { FIELD_NAME: key },
                },
            );

            rqCommands.push({ key: fieldValueCmd, value });

            // Получаем значение поля
            bitrix.api.addCmdBatch(
                fieldValueCmd,
                'crm.requisite.userfield.get',
                {
                    id: `$result[${fieldInfoCmd}][0][ID]`,
                },
            );
        }

        return rqCommands;
    }

    /**
     * Обрабатывает результаты batch запросов для пользовательских полей
     */
    processCustomFieldsFromBatch(
        batches: IBitrixBatchResponseResult[],
        rqCommands: Array<{ key: string; value: unknown }>,
    ): CustomField[] {
        const customFields: CustomField[] = [];

        for (const batch of batches) {
            if (!batch?.result) continue;

            for (const [resultKey, resultValue] of Object.entries(
                batch.result,
            )) {
                for (const cmd of rqCommands) {
                    if (cmd.key === resultKey) {
                        const customField = processCustomFieldResult(
                            resultValue as RawCustomFieldResult,
                            cmd.value,
                        );
                        addCustomFieldIfNotExists(customFields, customField);
                        break;
                    }
                }
            }
        }

        return customFields;
    }
}
