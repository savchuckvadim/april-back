import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { SKAP_DEAL_COMPLECT_FIELD } from '@lib/portal-lib/pbx/pbx-skap-smart';
import { getContractPeriodFieldBitrixId } from '../../../smart-act/services/ork-deals/utils/get-contract-period-field.util';

/** Кандидат-сделка воронки Сервис для привязки элемента СКАП. */
export interface SkapDealCandidate {
    id: number;
    closed: boolean;
    contractStart: Date | null;
    contractEnd: Date | null;
    /** ID комплектов АРМ сделки (UF_CRM_RPA_ARM_COMPLECT_ID). */
    complectIds: string[];
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
                    SKAP_DEAL_COMPLECT_FIELD,
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
                    complectIds: this.parseComplectIds(
                        raw[SKAP_DEAL_COMPLECT_FIELD],
                    ),
                });
                map.set(companyId, list);
            }
        }
        return map;
    }

    /**
     * Выбор сделки для отчётного месяца (приоритеты сверху вниз):
     * 1) месяц ∈ [contract_start, contract_end] И комплект АРМ сделки
     *    совпадает с «ID Комплекта» строки СКАП — идеальный матч
     *    (один комплект живёт в разных сделках на разные периоды —
     *    период отделяет, комплект решает спорные);
     * 2) месяц ∈ периода договора (без совпадения комплекта);
     * 3) период не покрыт, но комплект совпал → ворнинг;
     * 4) свежая ОТКРЫТАЯ + ворнинг deal_period_mismatch (сделки бывают
     *    дублями, без дат, вовремя не закрытыми);
     * 5) все закрыты → последняя + ворнинг;
     * 6) сделок нет → null (фундамент — компания, запись не блокируется).
     */
    pickDeal(
        candidates: SkapDealCandidate[] | undefined,
        period: Date,
        complectArmId?: string,
    ): SkapDealPick {
        if (!candidates?.length) return { dealId: null, warning: null };

        const complect = complectArmId?.trim() ?? '';
        const hasComplect = (deal: SkapDealCandidate): boolean =>
            complect !== '' && deal.complectIds.includes(complect);
        const latest = (deals: SkapDealCandidate[]): SkapDealCandidate =>
            deals.reduce((a, b) => (a.id > b.id ? a : b));

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

        // 1. Период + комплект — идеальный матч.
        const byPeriodAndComplect = byPeriod.filter(hasComplect);
        if (byPeriodAndComplect.length) {
            const picked = latest(byPeriodAndComplect);
            return {
                dealId: picked.id,
                warning:
                    byPeriodAndComplect.length > 1
                        ? `multiple_matching_deals: месяц и комплект ${complect} совпадают у ${byPeriodAndComplect.length} сделок, взята #${picked.id}`
                        : null,
            };
        }

        // 2. Только период.
        if (byPeriod.length) {
            const picked = latest(byPeriod);
            return {
                dealId: picked.id,
                warning:
                    byPeriod.length > 1
                        ? `multiple_matching_deals: месяц покрывают ${byPeriod.length} сделки, взята #${picked.id}`
                        : null,
            };
        }

        // 3. Период не покрыт — спорная ситуация, решает комплект АРМ.
        const byComplect = candidates.filter(hasComplect);
        if (byComplect.length) {
            const openByComplect = byComplect.filter(deal => !deal.closed);
            const picked = latest(
                openByComplect.length ? openByComplect : byComplect,
            );
            return {
                dealId: picked.id,
                warning:
                    `deal_period_mismatch: период договора не покрывает месяц, ` +
                    `взята сделка #${picked.id} по совпадению комплекта АРМ ${complect}`,
            };
        }

        // 4. Свежая открытая.
        const open = candidates.filter(deal => !deal.closed);
        if (open.length) {
            const picked = latest(open);
            return {
                dealId: picked.id,
                warning:
                    `deal_period_mismatch: ни одна сделка не покрывает месяц ` +
                    `датами договора, взята открытая #${picked.id}`,
            };
        }

        // 5. Все закрыты.
        const last = latest(candidates);
        return {
            dealId: last.id,
            warning:
                `deal_period_mismatch: все сделки закрыты и не покрывают ` +
                `месяц, взята последняя #${last.id}`,
        };
    }

    private parseDate(value: unknown): Date | null {
        if (!value || typeof value !== 'string') return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    /** UF_CRM_RPA_ARM_COMPLECT_ID: массив/строка/пусто → массив строк. */
    private parseComplectIds(value: unknown): string[] {
        const rawList = Array.isArray(value)
            ? value
            : typeof value === 'string' && value
              ? [value]
              : [];
        return rawList
            .map(item => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
    }
}
