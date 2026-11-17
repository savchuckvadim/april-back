import { BitrixService, type IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { parseBitrixField } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';

/** Поля сделки для проверки: воронка, закрыта ли, последняя активность. */
const PROBE_DEAL_SELECT = [
    'ID',
    'CATEGORY_ID',
    'CLOSED',
    'LAST_ACTIVITY_TIME',
] as const;

export type DealMovementProbeDealRead =
    | { readonly kind: 'ok'; readonly lastActivityAt: string | null }
    | { readonly kind: 'refused'; readonly reason: string };

/**
 * Сделка для проверки записи в ленту: только открытая сделка воронки
 * «ОП Основная» этого портала, иначе — отказ словами. Отдаёт «последнюю
 * активность» (`LAST_ACTIVITY_TIME`) в ISO.
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md).
 * Код воронки — enum portal-lib, id — через PortalModel (pbx-typing).
 */
export class DealMovementProbeDealReader {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async read(dealId: number): Promise<DealMovementProbeDealRead> {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            return {
                kind: 'refused',
                reason: 'На портале не настроена воронка «ОП Основная».',
            };
        }
        let deal: IBXDeal | undefined;
        try {
            deal = await this.load(dealId);
        } catch (error) {
            return {
                kind: 'refused',
                reason: `Сделку ${dealId} не удалось прочитать: ${getErrorString(error)}`,
            };
        }
        if (!deal) {
            return {
                kind: 'refused',
                reason: `Сделки ${dealId} нет на портале.`,
            };
        }
        if (String(deal.CATEGORY_ID) !== String(category.bitrixId)) {
            return {
                kind: 'refused',
                reason: `Сделка ${dealId} не из воронки «ОП Основная» — проверка не запускалась.`,
            };
        }
        if (deal.CLOSED === 'Y') {
            return {
                kind: 'refused',
                reason: `Сделка ${dealId} закрыта — проверка идёт только на открытой сделке.`,
            };
        }
        return { kind: 'ok', lastActivityAt: this.lastActivityOf(deal) };
    }

    /** Последняя активность сейчас, ISO; сделку не прочитать — ошибка. */
    async lastActivityAt(dealId: number): Promise<string | null> {
        return this.lastActivityOf(await this.load(dealId));
    }

    private async load(dealId: number): Promise<IBXDeal | undefined> {
        const response = await this.bitrix.deal.get(dealId, [
            ...PROBE_DEAL_SELECT,
        ]);
        return response?.result;
    }

    private lastActivityOf(deal: IBXDeal | undefined): string | null {
        return (
            parseBitrixField(
                deal?.LAST_ACTIVITY_TIME,
                this.portal.getTimezone(),
            )?.toISOString() ?? null
        );
    }
}
