import {
    BitrixService,
    IBXCompany,
    IBXContact,
    IBXDeal,
    IBXLead,
} from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import {
    ISalesEntityRef,
    ISalesPrefetchResult,
    SalesPrefetchEntityType,
} from './sales-entity-prefetch.type';

/**
 * Общий префетч сущностей для пачки хуков: собирает уникальные ссылки,
 * грузит все get-команды одним callBatchWithConcurrency(1) и раскладывает
 * ответы по типам.
 *
 * НЕ @Injectable: создаётся `new SalesEntityPrefetchService(bitrix)` с
 * per-domain инстансом (правило CLAUDE.md про race condition). Команды
 * независимые (без $result), поэтому групповой буфер не нужен —
 * см. ai/rules/bitrix-batch-grouping.md §7.
 */
export class SalesEntityPrefetchService {
    constructor(private readonly bitrix: BitrixService) {}

    async prefetch(refs: ISalesEntityRef[]): Promise<ISalesPrefetchResult> {
        const result: ISalesPrefetchResult = {
            leads: new Map(),
            companies: new Map(),
            deals: new Map(),
            contacts: new Map(),
        };
        const unique = this.dedupe(refs);
        if (unique.length === 0) return result;

        for (const ref of unique) {
            const cmd = this.cmdKey(ref);
            switch (ref.entityType) {
                case 'lead':
                    this.bitrix.batch.lead.get(cmd, ref.entityId);
                    break;
                case 'company':
                    this.bitrix.batch.company.get(cmd, ref.entityId);
                    break;
                case 'deal':
                    this.bitrix.batch.deal.get(cmd, ref.entityId);
                    break;
                case 'contact':
                    this.bitrix.batch.contact.get(cmd, ref.entityId);
                    break;
            }
        }

        const responses = await this.bitrix.api.callBatchWithConcurrency(1);
        this.assign(result, responses);
        return result;
    }

    private dedupe(refs: ISalesEntityRef[]): ISalesEntityRef[] {
        const seen = new Set<string>();
        const unique: ISalesEntityRef[] = [];
        for (const ref of refs) {
            if (!ref.entityId) continue;
            const key = `${ref.entityType}_${ref.entityId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(ref);
        }
        return unique;
    }

    /**
     * Раскладывает ответы обратно по типам. Тип узнаём из ключа команды —
     * ответы batch'а приходят плоским словарём cmdKey → entity.
     */
    private assign(
        result: ISalesPrefetchResult,
        responses: IBitrixBatchResponseResult[],
    ): void {
        for (const chunk of responses) {
            for (const key of Object.keys(chunk.result ?? {})) {
                const parsed = this.parseCmdKey(key);
                if (!parsed) continue;
                const entity = (chunk.result as Record<string, unknown>)[key];
                if (!entity) continue;
                switch (parsed.entityType) {
                    case 'lead':
                        result.leads.set(parsed.entityId, entity as IBXLead);
                        break;
                    case 'company':
                        result.companies.set(
                            parsed.entityId,
                            entity as IBXCompany,
                        );
                        break;
                    case 'deal':
                        result.deals.set(parsed.entityId, entity as IBXDeal);
                        break;
                    case 'contact':
                        result.contacts.set(
                            parsed.entityId,
                            entity as IBXContact,
                        );
                        break;
                }
            }
        }
    }

    private cmdKey(ref: ISalesEntityRef): string {
        return `sales_prefetch_${ref.entityType}_${ref.entityId}`;
    }

    private parseCmdKey(
        key: string,
    ): { entityType: SalesPrefetchEntityType; entityId: number } | null {
        const match = /^sales_prefetch_(lead|company|deal|contact)_(\d+)$/.exec(
            key,
        );
        if (!match) return null;
        return {
            entityType: match[1] as SalesPrefetchEntityType,
            entityId: Number(match[2]),
        };
    }
}
