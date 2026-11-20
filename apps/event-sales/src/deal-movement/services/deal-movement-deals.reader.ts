import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import type { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { DEAL_MOVEMENT_DEAL_SELECT } from '../constants/deal-movement.const';
import { toDealMovementRow } from '../lib/deal-movement-deal-row';
import {
    buildSalesBaseStageLookup,
    salesBaseStageTitles,
    type SalesBaseStageLookup,
} from '../lib/deal-movement-stages';
import type { DealMovementDealRow } from '../types/deal-movement.types';

/** Открытые сделки воронки и словарь её стадий — для истории стадий. */
export interface DealMovementOpenDeals {
    readonly categoryId: number;
    readonly stages: SalesBaseStageLookup;
    /** Код ступени лестницы → название стадии на портале (для витрины). */
    readonly stageTitles: ReadonlyMap<string, string>;
    readonly rows: DealMovementDealRow[];
}

/**
 * Все открытые сделки «ОП Основная» портала.
 *
 * Читаются ЦЕЛИКОМ курсором `>ID` (`bitrix.deal.all`, `start: -1`) — без
 * смещений в пачке: пропуск сделки сломал бы базовую линию, полнота
 * важнее числа запросов (решение 17.11.2026). Поля — только нужные.
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром на один прогон
 * портала (CLAUDE.md — иначе гонка между порталами). Коды воронки — из
 * enum portal-lib, id — через PortalModel (ai/rules/pbx-typing.md).
 */
export class DealMovementDealsReader {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async loadOpen(): Promise<DealMovementOpenDeals> {
        const category = this.requireCategory();
        const stages = buildSalesBaseStageLookup(category);
        const timezone = this.portal.getTimezone();
        const raw = await this.bitrix.deal.all(
            { CATEGORY_ID: String(category.bitrixId), CLOSED: 'N' },
            [...DEAL_MOVEMENT_DEAL_SELECT],
        );
        const rows: DealMovementDealRow[] = [];
        for (const item of raw) {
            const row = toDealMovementRow(item, stages, timezone);
            if (row !== null) rows.push(row);
        }
        return {
            categoryId: Number(category.bitrixId),
            stages,
            stageTitles: salesBaseStageTitles(category),
            rows,
        };
    }

    /** Воронки нет на портале — ошибка конфигурации, а не пустой счёт. */
    private requireCategory(): IPCategory {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            throw new Error(
                'Воронка «ОП Основная» (sales_base) не настроена на портале — движение сделок не считается',
            );
        }
        return category;
    }
}
