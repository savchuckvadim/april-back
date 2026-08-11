import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { getContractPeriodFieldBitrixId } from '../../../smart-act/services/ork-deals/utils/get-contract-period-field.util';

/** Кандидат-сделка воронки Сервис для привязки элемента СКАП. */
export interface SkapDealCandidate {
    id: number;
    closed: boolean;
    contractStart: Date | null;
    contractEnd: Date | null;
}

export interface SkapDealPick {
    dealId: number | null;
    /** multiple_matching_deals / deal_period_mismatch — в ворнинги записи. */
    warning: string | null;
}

const FILTER_CHUNK = 50;

/**
 * Сделки для связи элементов СКАП: категория service_base, выбор по датам
 * действия договора (contract_start/contract_end). Сделки бывают дублями,
 * без дат, вовремя не закрытыми — сделка никогда не блокирует запись
 * (фундамент — компания).
 *
 * НЕ @Injectable: создаётся `new SkapDealMatchService(bitrix, portalModel)`.
 */
export class SkapDealMatchService {
    private readonly logger = new Logger(SkapDealMatchService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
    ) {}

    /** Все сделки service_base компаний: companyId → кандидаты. */
    async loadDeals(
        companyIds: number[],
    ): Promise<Map<number, SkapDealCandidate[]>> {
        const category = this.portalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.service_base,
        );
        if (!category) {
            // Отсутствие воронки Сервис — ошибка конфигурации портала
            // (pbx-typing), но запись СКАП не блокируем: только компания.
            this.logger.warn(
                'Воронка service_base не найдена на портале — элементы без сделок',
            );
            return new Map();
        }
        const startField = getContractPeriodFieldBitrixId(
            this.portalModel,
            'start',
        );
        const endField = getContractPeriodFieldBitrixId(
            this.portalModel,
            'end',
        );

        const map = new Map<number, SkapDealCandidate[]>();
        const unique = [...new Set(companyIds)];
        for (let i = 0; i < unique.length; i += FILTER_CHUNK) {
            const chunk = unique.slice(i, i + FILTER_CHUNK);
            const deals = await this.bitrix.deal.all(
                {
                    CATEGORY_ID: category.bitrixId,
                    '@COMPANY_ID': chunk,
                } as unknown as Partial<IBXDeal>,
                [
                    'ID',
                    'COMPANY_ID',
                    'CLOSED',
                    'CATEGORY_ID',
                    startField,
                    endField,
                ],
            );
            for (const deal of deals) {
                const raw = deal as unknown as Record<string, unknown>;
                const companyId = Number(raw.COMPANY_ID);
                if (!companyId) continue;
                const list = map.get(companyId) ?? [];
                list.push({
                    id: Number(raw.ID),
                    closed: raw.CLOSED === 'Y',
                    contractStart: this.parseDate(raw[startField]),
                    contractEnd: this.parseDate(raw[endField]),
                });
                map.set(companyId, list);
            }
        }
        return map;
    }

    /**
     * Выбор сделки для отчётного месяца:
     * 1) месяц ∈ [contract_start, contract_end] → несколько → свежая по ID
     *    + ворнинг multiple_matching_deals;
     * 2) по датам никто не подошёл → свежая ОТКРЫТАЯ + ворнинг
     *    deal_period_mismatch;
     * 3) сделок нет → null (только компания, без ворнинга).
     */
    pickDeal(
        candidates: SkapDealCandidate[] | undefined,
        period: Date,
    ): SkapDealPick {
        if (!candidates?.length) return { dealId: null, warning: null };

        const monthEnd = new Date(
            period.getFullYear(),
            period.getMonth() + 1,
            0,
        );
        const byPeriod = candidates.filter(
            deal =>
                deal.contractStart !== null &&
                deal.contractEnd !== null &&
                deal.contractStart <= monthEnd &&
                deal.contractEnd >= period,
        );
        if (byPeriod.length) {
            const picked = byPeriod.reduce((a, b) => (a.id > b.id ? a : b));
            return {
                dealId: picked.id,
                warning:
                    byPeriod.length > 1
                        ? `multiple_matching_deals: месяц покрывают ${byPeriod.length} сделки, взята #${picked.id}`
                        : null,
            };
        }

        const open = candidates.filter(deal => !deal.closed);
        if (open.length) {
            const picked = open.reduce((a, b) => (a.id > b.id ? a : b));
            return {
                dealId: picked.id,
                warning:
                    `deal_period_mismatch: ни одна сделка не покрывает месяц ` +
                    `датами договора, взята открытая #${picked.id}`,
            };
        }

        const latest = candidates.reduce((a, b) => (a.id > b.id ? a : b));
        return {
            dealId: latest.id,
            warning:
                `deal_period_mismatch: все сделки закрыты и не покрывают ` +
                `месяц, взята последняя #${latest.id}`,
        };
    }

    private parseDate(value: unknown): Date | null {
        if (!value || typeof value !== 'string') return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
}
