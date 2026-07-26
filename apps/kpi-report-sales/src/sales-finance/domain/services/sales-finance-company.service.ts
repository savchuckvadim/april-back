/**
 * Данные компаний для финансовой аналитики: название + перспектива (цвет).
 *
 * НЕ @Injectable: создаётся per-request через `new` с инстансом bitrix и
 * PortalModel из pbx.init(domain) — см. правило про race condition в CLAUDE.md.
 * Один независимый list-вызов — батч-группировка не нужна.
 *
 * Перспектива компании — pbx-поле UF_CRM_OP_PROSPECTS (enum, code = цвет:
 * green/yellow/red…), резолвится через PortalModel.getCompanyFieldByCode
 * ('op_prospects') — тот же паттерн, что в sales-user-report.service.
 */
import { BitrixService, IBXCompany } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

export interface CompanyInfo {
    title: string;
    /** Код цвета перспективы (op_prospects) или null. */
    color: string | null;
}

export class SalesFinanceCompanyService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /** Карта companyId → {title, color}; пустой вход — без запроса к Bitrix. */
    async getInfoMap(companyIds: number[]): Promise<Map<number, CompanyInfo>> {
        const ids = [...new Set(companyIds.filter(id => id > 0))];
        if (!ids.length) return new Map();

        const companies = await this.bitrix.company.all(
            { '@ID': ids.map(String) },
            ['ID', 'TITLE', 'UF_CRM_OP_PROSPECTS'],
        );

        return new Map(
            (companies ?? []).map(company => [
                Number(company.ID),
                {
                    title: String(company.TITLE ?? ''),
                    color: this.resolveColor(company as IBXCompany),
                },
            ]),
        );
    }

    /** UF_CRM_OP_PROSPECTS → code цвета из портального enum-поля op_prospects. */
    private resolveColor(company: IBXCompany | null): string | null {
        if (!company || !company.UF_CRM_OP_PROSPECTS) return null;
        const field = this.portal.getCompanyFieldByCode('op_prospects');
        if (!field) return null;
        const itemId = Number(company.UF_CRM_OP_PROSPECTS);
        if (!itemId) return null;
        return (
            (field.items?.find(item => Number(item.bitrixId) === itemId)
                ?.code as string) ?? null
        );
    }
}
