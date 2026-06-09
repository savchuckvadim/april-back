import { Injectable } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix/bitrix.service';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { Bank } from '../../../types/bx-bank.type';

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
     * Обновляет или создает банк в Bitrix24
     */
    async updateBank(
        bitrix: BitrixService,
        bank: Bank,
    ): Promise<boolean | { bx_id: unknown }> {
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
                return false;
            }
            return {
                bx_id: (result?.result as unknown[] | undefined)?.[0],
            };
        } else {
            const result = (await bitrix.api.call(
                'crm.requisite.bankdetail.update',
                {
                    id: preparedBank.ID,
                    fields: updateBank,
                },
            )) as BxBankMutationResponse;
            return !result?.error;
        }
    }
}
