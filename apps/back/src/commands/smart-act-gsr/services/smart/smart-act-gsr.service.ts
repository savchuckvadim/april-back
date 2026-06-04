import { IBXItem } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal/services/portal.model';
import { Injectable } from '@nestjs/common';
import { CategorySmartActService } from './category-smart-act.service';

export interface ISmartActItemsByDealResult {
    items: IActSmartItemResult[];
    count: number;
}

export type TStageType = 'new' | 'success' | 'fail' | 'inprogress';
export interface IActSmartItemResult {
    id?: number;
    stageType: TStageType;
    from: string | null;
    to: string | null;
    quantity: number | null;
}
@Injectable()
export class SmartActGsrService {
    constructor(
        private readonly pbx: PBXService,
        private readonly categorySmartActService: CategorySmartActService,
    ) {}

    async getSmartActGsr() {
        const domain = 'gsr.bitrix24.ru';
        const { PortalModel, portal } = await this.pbx.init(domain);
        const targetSmart = this.getSmartActType(PortalModel);
        const smarts = portal.smarts;
        return {
            targetSmart,
            smarts: smarts?.map(s => s.name),
        };
    }

    async getSmartActItemsByDeal(
        dealId: number,
    ): Promise<ISmartActItemsByDealResult> {
        const domain = 'gsr.bitrix24.ru';
        const { PortalModel, bitrix } = await this.pbx.init(domain);
        const targetSmart = this.getSmartActType(PortalModel);
        if (!targetSmart?.entityTypeId) {
            return {
                items: [],
                count: 0,
            };
        }
        const smartItemsRaw = await bitrix.item.list(
            targetSmart.entityTypeId.toString(),
            {
                parentId2: dealId,
            },
        );

        const smartItems = smartItemsRaw.result.items;

        return {
            items: smartItems.map(item => this.getActSmartItemResult(item)),
            count: smartItems.length,
        };
    }

    public async closeSuccessSmartAct(smartId: number) {
        const domain = 'gsr.bitrix24.ru';
        const { PortalModel, bitrix } = await this.pbx.init(domain);
        const targetSmart = this.getSmartActType(PortalModel);
        if (!targetSmart?.entityTypeId) {
            return {
                items: [],
                count: 0,
            };
        }
        const categoryId = targetSmart.categories[0].id;
        const stageId = `DT${targetSmart.entityTypeId}_${categoryId}:SUCCESS`;
        const smartItemsRaw = await bitrix.item.update(
            smartId,
            targetSmart.entityTypeId,
            {
                stageId: stageId,
            },
        );
        return smartItemsRaw;
    }

    private getSmartActType(portal: PortalModel) {
        const targetSmart = portal.getSmartByType('service_act');
        return targetSmart;
    }

    private getSmartQuantity(item: IBXItem): number {
        return Number(item.ufCrm13ProductCount);
        //    ufCrm13PeriodFrom: null,
        //   ufCrm13PeriodTo: null,
        //   ufCrm13ProductCount: null,
    }
    private getActSmartItemResult(item: IBXItem): IActSmartItemResult {
        const rawId = item.id;
        let id: number | undefined;
        if (rawId != null) {
            const n = typeof rawId === 'number' ? rawId : Number(rawId);
            id = Number.isFinite(n) ? n : undefined;
        }
        return {
            ...(id != null ? { id } : {}),
            stageType: this.getItemStageType(item),
            from: item.ufCrm13PeriodFrom as string | null,
            to: item.ufCrm13PeriodTo as string | null,
            quantity: this.getSmartQuantity(item),
        };
    }

    private async getCategoriesData(domain: string) {
        const { PortalModel } = await this.pbx.init(domain);
        const targetSmart = this.getSmartActType(PortalModel);
        if (!targetSmart?.entityTypeId) {
            return null;
        }
        const data = await this.categorySmartActService.getCategorySmartAct(
            domain,
            targetSmart,
        );
        return data;
    }

    private getItemStageType(item: IBXItem): TStageType {
        if (this.categorySmartActService.isNewStage(item)) {
            return 'new';
        }
        if (this.categorySmartActService.isSuccessStage(item)) {
            return 'success';
        }
        if (this.categorySmartActService.isFailStage(item)) {
            return 'fail';
        }
        return 'inprogress';
    }
}
