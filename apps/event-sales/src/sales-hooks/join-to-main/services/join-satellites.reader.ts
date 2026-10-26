import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { zprOpenStageIds } from '../../../zpr-flow/services/zpr-stage.resolver';
import { toId } from './join-to-main.plan';

type BxRow = Record<string, unknown>;

/** Аналитическая сделка-спутник дубля. */
export interface IJoinSatelliteDeal {
    id: number;
    categoryCode:
        | PbxDealCategoryCodeEnum.sales_xo
        | PbxDealCategoryCodeEnum.sales_presentation;
    closed: boolean;
}

/** Спутники сделки-дубля: что прочитано до записи. */
export interface IJoinSatellites {
    deals: IJoinSatelliteDeal[];
    /** Открытые элементы ЗПР, родитель которых — дубль. */
    zprItemIds: number[];
    /** Смарт ЗПР на портале; null — не установлен. */
    zpr: ZprSmartInfo | null;
    warnings: string[];
}

export const EMPTY_JOIN_SATELLITES: IJoinSatellites = {
    deals: [],
    zprItemIds: [],
    zpr: null,
    warnings: [],
};

const SATELLITE_CATEGORIES = [
    PbxDealCategoryCodeEnum.sales_xo,
    PbxDealCategoryCodeEnum.sales_presentation,
] as const;

/** Родитель-сделка элемента смарта (системное поле crm.item). */
const DEAL_PARENT_KEY = 'parentId2';

/**
 * Спутники сделки-дубля для «Присоединить сюда» (владелец 26.10.2026):
 * сделки ХО и презентаций, ссылающиеся на дубль через `to_base_sales`, и
 * открытые элементы ЗПР с дублем в родителях.
 *
 * Прямые вызовы, не общая карта batch-команд: читатель зовётся между
 * чтением основного снимка и записью, когда в инстансе не должно быть
 * накопленных команд. Сбой чтения — предупреждение, присоединение идёт
 * без спутников. НЕ @Injectable: bitrix привязан к домену.
 */
export class JoinSatellitesReader {
    private readonly logger = new Logger(JoinSatellitesReader.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async read(
        sourceId: number,
        zpr: ZprSmartInfo | null,
    ): Promise<IJoinSatellites> {
        const warnings: string[] = [];
        const deals = await this.deals(sourceId, warnings);
        const zprItemIds = zpr
            ? await this.zprItems(sourceId, zpr, warnings)
            : [];
        return { deals, zprItemIds, zpr, warnings };
    }

    private async deals(
        sourceId: number,
        warnings: string[],
    ): Promise<IJoinSatelliteDeal[]> {
        const field = this.portal.getEntityFieldByCode(
            'deal',
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
        );
        const codeByCategory = new Map<
            number,
            IJoinSatelliteDeal['categoryCode']
        >();
        for (const code of SATELLITE_CATEGORIES) {
            const category = this.portal.getDealCategoryByCode(code);
            if (category) codeByCategory.set(Number(category.bitrixId), code);
        }
        if (!field || !codeByCategory.size) return [];

        const linkKey = this.portal.getFieldBitrixId(field);
        try {
            const response = (await this.bitrix.api.call('crm.deal.list', {
                filter: {
                    [linkKey]: sourceId,
                    CATEGORY_ID: [...codeByCategory.keys()],
                },
                select: ['ID', 'CATEGORY_ID', 'CLOSED', linkKey],
                start: -1,
            })) as { result?: unknown };
            const rows = Array.isArray(response?.result)
                ? (response.result as BxRow[])
                : [];
            return rows
                .filter(row => toId(row[linkKey]) === sourceId)
                .map(row => ({
                    id: toId(row.ID) ?? 0,
                    categoryCode: codeByCategory.get(Number(row.CATEGORY_ID)),
                    closed: row.CLOSED === 'Y',
                }))
                .filter(
                    (deal): deal is IJoinSatelliteDeal =>
                        deal.id > 0 && Boolean(deal.categoryCode),
                );
        } catch (error) {
            const message = `Спутники сделки ${sourceId} не прочитаны: ${(error as Error).message}`;
            this.logger.warn(message);
            warnings.push(message);
            return [];
        }
    }

    private async zprItems(
        sourceId: number,
        zpr: ZprSmartInfo,
        warnings: string[],
    ): Promise<number[]> {
        const openStages = zprOpenStageIds(zpr);
        if (!openStages.length) return [];
        try {
            const response = (await this.bitrix.api.call('crm.item.list', {
                entityTypeId: zpr.entityTypeId,
                filter: { [DEAL_PARENT_KEY]: sourceId, stageId: openStages },
                select: ['id', DEAL_PARENT_KEY],
            })) as { result?: { items?: unknown } };
            const items = Array.isArray(response?.result?.items)
                ? (response.result.items as BxRow[])
                : [];
            return items
                .filter(item => toId(item[DEAL_PARENT_KEY]) === sourceId)
                .map(item => toId(item.id))
                .filter((id): id is number => id !== null);
        } catch (error) {
            const message = `ЗПР сделки ${sourceId} не прочитаны: ${(error as Error).message}`;
            this.logger.warn(message);
            warnings.push(message);
            return [];
        }
    }
}
