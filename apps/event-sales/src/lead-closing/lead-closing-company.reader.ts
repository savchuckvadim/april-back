import { BitrixService } from '@/modules/bitrix';

const CHUNK = 50;

/**
 * Кто стоит в поле «Лид» у компаний (0 — никто). Нужен запасной связи:
 * у сделки «Лид» один, и лид, чья сделка уже занята другим лидом, ставится
 * в «Лид» компании — решение владельца 14.11.2026 (garant: 96 лидов делят
 * 88 сделок).
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class LeadCompanyLinkReader {
    constructor(private readonly bitrix: BitrixService) {}

    async read(companyIds: number[]): Promise<Map<number, number>> {
        const ids = [...new Set(companyIds.filter(id => id > 0))];
        const leadOf = new Map<number, number>();
        for (let i = 0; i < ids.length; i += CHUNK) {
            const rows = await this.bitrix.company.all(
                { '@ID': ids.slice(i, i + CHUNK) },
                ['ID', 'LEAD_ID'],
            );
            for (const row of rows) {
                leadOf.set(Number(row.ID), Number(row.LEAD_ID ?? 0) || 0);
            }
        }
        return leadOf;
    }
}
