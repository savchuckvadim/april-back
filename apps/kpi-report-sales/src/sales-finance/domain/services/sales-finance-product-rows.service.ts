/**
 * Загрузка товарных строк сделок батчами (crm.item.productrow.list)
 * с ПРОМЕЖУТОЧНЫМ КЭШЕМ per-сделка.
 *
 * Ключ ячейки включает DATE_MODIFY сделки: сделка изменилась → другой
 * ключ (промах) → строки перечитываются; неизменные сделки берутся из
 * кэша мгновенно. Поэтому пересчёт/рефреш «продолжает с места» — тянет
 * ТОЛЬКО недостающее, а не всё заново. Старые версии протухают по TTL.
 *
 * НЕ @Injectable: создаётся per-request через `new` с инстансом bitrix.
 * Команды независимы (без $result[...]), поэтому по
 * ai/rules/bitrix-batch-grouping.md достаточно plain batch +
 * callBatchWithConcurrency(1); cmd-ключи уникальны (rows_{dealId}).
 */
import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { IBXProductRowRow } from '@/modules/bitrix/domain/crm/product-row/interface/bx-product-row.interface';
import { ListProductRowDto } from '@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto';
import { SalesFinanceCacheService } from '../../cache/sales-finance-cache.service';
import { buildDealStamp, buildRowsKey } from '../../cache/cache-key.util';
import { SALES_FINANCE_ROWS_TTL_SECONDS } from '../../constants/sales-finance.const';

const CMD_PREFIX = 'rows_';
const BATCH_CHUNK_SIZE = 50;

/** Сделка для загрузки строк: id + DATE_MODIFY (версия кэш-ячейки). */
export interface RowsDealRef {
    id: number;
    dateModify?: string;
}

export class SalesFinanceProductRowsService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly cache: SalesFinanceCacheService,
        private readonly domain: string,
    ) {}

    /**
     * Товарные строки по сделкам: Map<dealId, rows>. Сначала кэш
     * (батч-чтение), промахи — Bitrix-батчами + write-through в кэш.
     */
    async getRowsByDeals(
        deals: RowsDealRef[],
    ): Promise<Map<number, IBXProductRowRow[]>> {
        const rowsByDealId = new Map<number, IBXProductRowRow[]>();
        const unique = [
            ...new Map(deals.map(deal => [deal.id, deal])).values(),
        ];
        if (!unique.length) return rowsByDealId;

        const keys = unique.map(deal =>
            buildRowsKey(this.domain, deal.id, buildDealStamp(deal.dateModify)),
        );
        const cached = await this.cache.getJsonMany<IBXProductRowRow[]>(keys);

        const missing: RowsDealRef[] = [];
        unique.forEach((deal, index) => {
            const rows = cached[index];
            if (rows) {
                rowsByDealId.set(deal.id, rows);
            } else {
                missing.push(deal);
            }
        });
        if (!missing.length) return rowsByDealId;

        const fetched = await this.fetchRows(missing.map(deal => deal.id));
        // Write-through: пустые массивы тоже кэшируем — иначе сделки без
        // строк промахивались бы вечно.
        await this.cache.setJsonMany(
            missing.map(deal => ({
                key: buildRowsKey(
                    this.domain,
                    deal.id,
                    buildDealStamp(deal.dateModify),
                ),
                value: fetched.get(deal.id) ?? [],
            })),
            SALES_FINANCE_ROWS_TTL_SECONDS,
        );
        missing.forEach(deal =>
            rowsByDealId.set(deal.id, fetched.get(deal.id) ?? []),
        );
        return rowsByDealId;
    }

    /** Живая выгрузка строк по сделкам (батчи по 50). */
    private async fetchRows(
        dealIds: number[],
    ): Promise<Map<number, IBXProductRowRow[]>> {
        const rowsByDealId = new Map<number, IBXProductRowRow[]>();

        for (let i = 0; i < dealIds.length; i += BATCH_CHUNK_SIZE) {
            const chunk = dealIds.slice(i, i + BATCH_CHUNK_SIZE);
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
