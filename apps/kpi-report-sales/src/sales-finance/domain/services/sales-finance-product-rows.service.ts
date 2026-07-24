/**
 * Загрузка товарных строк сделок батчами (crm.item.productrow.list).
 *
 * НЕ @Injectable: создаётся per-request через `new` с инстансом bitrix.
 * Команды независимы (без $result[...]), поэтому по ai/rules/bitrix-batch-grouping.md
 * достаточно plain batch + callBatchWithConcurrency(1); cmd-ключи уникальны
 * (rows_{dealId}) — дубликат ключа batch-очередь молча дропает.
 *
 * Единственная точка отката: если batch с '='-ключами фильтра не заработает
 * на живом портале даже после фикса dictToQueryString, заменить на
 * последовательные bitrix.productRow.list (как в smart-act).
 */
import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { IBXProductRowRow } from '@/modules/bitrix/domain/crm/product-row/interface/bx-product-row.interface';
import { ListProductRowDto } from '@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto';

const CMD_PREFIX = 'rows_';
const BATCH_CHUNK_SIZE = 50;

export class SalesFinanceProductRowsService {
    constructor(private readonly bitrix: BitrixService) {}

    /** Товарные строки по сделкам: Map<dealId, rows>. */
    async getRowsByDealIds(
        dealIds: number[],
    ): Promise<Map<number, IBXProductRowRow[]>> {
        const rowsByDealId = new Map<number, IBXProductRowRow[]>();
        const uniqueIds = [...new Set(dealIds)];

        for (let i = 0; i < uniqueIds.length; i += BATCH_CHUNK_SIZE) {
            const chunk = uniqueIds.slice(i, i + BATCH_CHUNK_SIZE);
            for (const dealId of chunk) {
                const dto: ListProductRowDto = {
                    '=ownerType': BitrixOwnerType.DEAL,
                    '=ownerId': dealId,
                };
                void this.bitrix.batch.productRow.list(
                    `${CMD_PREFIX}${dealId}`,
                    dto,
                );
            }

            const batchResults =
                await this.bitrix.api.callBatchWithConcurrency(1);

            for (const chunkResult of batchResults) {
                const resultMap = (chunkResult?.result ?? {}) as Record<
                    string,
                    { productRows?: IBXProductRowRow[] } | undefined
                >;
                for (const [cmdKey, value] of Object.entries(resultMap)) {
                    if (!cmdKey.startsWith(CMD_PREFIX)) continue;
                    const dealId = Number(cmdKey.slice(CMD_PREFIX.length));
                    rowsByDealId.set(dealId, value?.productRows ?? []);
                }
            }
        }

        return rowsByDealId;
    }
}
