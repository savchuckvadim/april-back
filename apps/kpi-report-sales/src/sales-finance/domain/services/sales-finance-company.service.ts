/**
 * Данные компаний для финансовой аналитики: название + перспектива (цвет)
 * + тип клиента.
 *
 * НЕ @Injectable: создаётся per-request через `new` с инстансом bitrix и
 * PortalModel из pbx.init(domain) — см. правило про race condition в CLAUDE.md.
 * Один независимый list-вызов — батч-группировка не нужна.
 *
 * Enum-поля компании (op_prospects → цвет, op_client_type → тип клиента)
 * резолвятся одинаково: numeric id элемента из UF_CRM_* → семантический
 * code элемента через PortalModel.getCompanyFieldByCode. UF-ключи селекта
 * тоже берутся с портала (id полей per-portal) — никаких хардкодов.
 */
import { BitrixService, IBXCompany } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

export interface CompanyInfo {
    title: string;
    /** Код цвета перспективы (op_prospects) или null. */
    color: string | null;
    /** Код типа клиента (op_client_type: state/commerc/ip/fiz/layer) или null. */
    clientTypeCode: string | null;
}

export class SalesFinanceCompanyService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /** Карта companyId → CompanyInfo; пустой вход — без запроса к Bitrix. */
    async getInfoMap(companyIds: number[]): Promise<Map<number, CompanyInfo>> {
        const ids = [...new Set(companyIds.filter(id => id > 0))];
        if (!ids.length) return new Map();

        const prospectsUf = this.companyFieldUf(
            PBX_SALES_EVENT_FIELD_CODES.op_prospects,
        );
        const clientTypeUf = this.companyFieldUf(
            PBX_SALES_EVENT_FIELD_CODES.op_client_type,
        );

        const companies = await this.bitrix.company.all(
            { '@ID': ids.map(String) },
            ['ID', 'TITLE', prospectsUf, clientTypeUf].filter(Boolean),
        );

        return new Map(
            (companies ?? []).map(company => [
                Number(company.ID),
                {
                    title: String(company.TITLE ?? ''),
                    color: this.resolveItemCode(
                        company,
                        PBX_SALES_EVENT_FIELD_CODES.op_prospects,
                        prospectsUf,
                    ),
                    clientTypeCode: this.resolveItemCode(
                        company,
                        PBX_SALES_EVENT_FIELD_CODES.op_client_type,
                        clientTypeUf,
                    ),
                },
            ]),
        );
    }

    /** UF_CRM-ключ enum-поля компании; '' — поле не настроено на портале. */
    private companyFieldUf(code: string): string {
        const field = this.portal.getCompanyFieldByCode(code);
        return field?.bitrixId ? this.portal.getFieldBitrixId(field) : '';
    }

    /** Значение UF_CRM (numeric id элемента) → семантический code элемента. */
    private resolveItemCode(
        company: IBXCompany | null,
        fieldCode: string,
        ufKey: string,
    ): string | null {
        if (!company || !ufKey) return null;
        const raw = (company as Record<string, unknown>)[ufKey];
        const itemId = Number(raw);
        if (!itemId) return null;
        const field = this.portal.getCompanyFieldByCode(fieldCode);
        if (!field) return null;
        return (
            (field.items?.find(item => Number(item.bitrixId) === itemId)
                ?.code as string) ?? null
        );
    }
}
