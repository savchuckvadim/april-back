import { BadRequestException, Injectable } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix/bitrix.service';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { Bank } from '../../../types/bx-bank.type';
import { ErrorMessage } from '../../../enums/error-message.enum';

import {
    filterBankFields,
    addMissingBank,
    prepareBankForSave,
    RequisiteWithBank,
} from '../utils/bank.utils';

/**
 * Ответ Bitrix24 при добавлении/обновлении банка
 * (crm.requisite.bankdetail.add/update)
 */
interface BxBankMutationResponse {
    result?: unknown;
    error?: string;
    error_description?: string;
}

/**
 * Сервис для работы с банковскими реквизитами
 */
@Injectable()
export class BxRqBankService {
    /**
     * Добавляет batch команду для получения банков реквизита
     */
    addBankBatchCommand(bitrix: BitrixService, requisiteId: number): void {
        bitrix.api.addCmdBatch(
            `bankdetail_${requisiteId}`,
            'crm.requisite.bankdetail.list',
            {
                filter: { ENTITY_ID: requisiteId },
            },
        );
    }

    /**
     * Обрабатывает результаты batch запроса для банков
     */
    processBanksFromBatch(batches: IBitrixBatchResponseResult[]): Bank[] {
        for (const batch of batches) {
            if (!batch?.result) continue;

            for (const [resultKey, resultValue] of Object.entries(
                batch.result,
            )) {
                if (resultKey.includes('bankdetail')) {
                    const banks = resultValue as Partial<Bank>[];
                    if (banks && Array.isArray(banks) && banks.length > 0) {
                        return banks.map(bank => new Bank(bank));
                    }
                }
            }
        }
        return [];
    }

    /**
     * Добавляет недостающий банк к реквизиту
     */
    ensureRequiredBank(requisite: RequisiteWithBank): void {
        addMissingBank(requisite);
    }

    /**
     * Создаёт или обновляет банк; возвращает id банка в Bitrix.
     */
    async updateBank(bitrix: BitrixService, bank: Bank): Promise<number> {
        const preparedBank = prepareBankForSave(bank);
        const updateBank = filterBankFields(preparedBank);

        if (preparedBank.ID === null || preparedBank.ID === undefined) {
            const result = (await bitrix.api.call(
                'crm.requisite.bankdetail.add',
                {
                    fields: updateBank,
                },
            )) as BxBankMutationResponse;
            if (result?.error) {
                throw new BadRequestException(
                    result.error_description || result.error,
                );
            }
            const bankId = Number(result?.result);
            if (!bankId) {
                throw new BadRequestException(ErrorMessage.BANK_NOT_CREATED);
            }
            return bankId;
        }

        const result = (await bitrix.api.call(
            'crm.requisite.bankdetail.update',
            {
                id: preparedBank.ID,
                fields: updateBank,
            },
        )) as BxBankMutationResponse;
        if (result?.error) {
            throw new BadRequestException(
                result.error_description || result.error,
            );
        }
        return Number(preparedBank.ID);
    }
}
