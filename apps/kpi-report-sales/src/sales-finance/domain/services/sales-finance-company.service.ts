/**
 * Названия компаний для финансовой аналитики (companyId → TITLE).
 *
 * НЕ @Injectable: создаётся per-request через `new` с инстансом bitrix
 * из pbx.init(domain) — см. правило про race condition в CLAUDE.md.
 * Один независимый list-вызов — батч-группировка не нужна
 * (ai/rules/bitrix-batch-grouping.md, §независимые команды).
 */
import { BitrixService } from '@/modules/bitrix';

export class SalesFinanceCompanyService {
    constructor(private readonly bitrix: BitrixService) {}

    /** Карта companyId → TITLE; пустой вход — без запроса к Bitrix. */
    async getTitleMap(companyIds: number[]): Promise<Map<number, string>> {
        const ids = [...new Set(companyIds.filter(id => id > 0))];
        if (!ids.length) return new Map();

        const companies = await this.bitrix.company.all(
            { '@ID': ids.map(String) },
            ['ID', 'TITLE'],
        );

        return new Map(
            (companies ?? []).map(company => [
                Number(company.ID),
                String(company.TITLE ?? ''),
            ]),
        );
    }
}
