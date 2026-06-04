import {
    ISmartActItemsByDealResult,
    TStageType,
} from './smart-act-gsr.service';
import { PortalModel } from '@lib/portal/services/portal.model';
import { CategorySmartActService } from './category-smart-act.service';
import { BitrixService, IBXItem } from '@/modules/bitrix';
import { IPSmart } from '@lib/portal/interfaces/portal.interface';

export interface ICreateSmartAct {
    dealId: number;
    companyId: number;
    responsibleId: number;
    productQuantity: number;
    productCoefficient: number;
    smartItems: ISmartActItemsByDealResult;
    from: string;
    to: string;
    quantity: number;
    stageType: TStageType;
}
export class SmartActService {
    targetSmart!: IPSmart;
    constructor(
        private readonly domain: string,
        private readonly bitrix: BitrixService,
        portalModel: PortalModel,
        private readonly categorySmartActService: CategorySmartActService,
    ) {
        const targetSmart = this.getSmartActType(portalModel);
        if (!targetSmart || !targetSmart?.entityTypeId) {
            throw new Error('Target smart not found');
        }
        this.targetSmart = targetSmart;
    }

    async createSmartActGsr(dto: ICreateSmartAct): Promise<number | null> {
        console.log('CREATE SMART id', dto.dealId);
        const stagesData =
            await this.categorySmartActService.getSmartStageDataForCreate(
                this.domain,
                this.targetSmart,
            );
        const stageData =
            dto.stageType === 'new'
                ? stagesData.new
                : dto.stageType === 'inprogress'
                  ? stagesData.inprogress
                  : stagesData.success;
        if (!stageData.stage) {
            return null;
        }
        const entityTypeId = this.targetSmart.entityTypeId.toString();
        const data: Partial<IBXItem> = {
            categoryId: stageData.stage.CATEGORY_ID,
            stageId: stageData.stage.STATUS_ID,
            parentId2: dto.dealId,
            companyId: dto.companyId,
            parentId4: dto.companyId,
            assignedById: dto.responsibleId,
            title: this.formatActPeriodTitle(dto.from, dto.to),
            ufCrm13PeriodFrom: dto.from,
            ufCrm13PeriodTo: dto.to,
            ufCrm13ProductCount: dto.quantity,
        };
        const res = await this.bitrix.item.add(entityTypeId, data);
        const rawId = (res as { result?: { item?: { id?: number | string } } })
            ?.result?.item?.id;
        const newId =
            rawId == null
                ? NaN
                : typeof rawId === 'number'
                  ? rawId
                  : Number(rawId);
        return Number.isFinite(newId) ? newId : null;
    }

    async updateSmartActFromTo(
        id: number,
        from: string,
        to: string,
    ): Promise<boolean> {
        console.log('UPDATE SMART FromTo id', id);
        await this.bitrix.item.update(id, this.targetSmart.entityTypeId, {
            ufCrm13PeriodFrom: from,
            ufCrm13PeriodTo: to,
        });
        // await this.bitrix.batch.item.update(
        //     'dfgdfgupdate_batch',
        //     id,
        //     this.targetSmart.entityTypeId, {
        //     ufCrm13PeriodFrom: from,
        //     ufCrm13PeriodTo: to,
        // });
        return true;
    }

    async updtaeSmartActCloseToSuccess(id: number): Promise<boolean> {
        // const domain = 'gsr.bitrix24.ru';
        // const { PortalModel } = await this.pbx.init(domain);
        // const targetSmart = this.getSmartActType(PortalModel);
        // if (!targetSmart?.entityTypeId) {
        //     return false;
        // }

        const stagesData =
            await this.categorySmartActService.getSmartStageDataForCreate(
                this.domain,
                this.targetSmart,
            );
        const stageData = stagesData.success;

        if (!stageData.stage) {
            return false;
        }
        await this.bitrix.item.update(id, this.targetSmart.entityTypeId, {
            stageId: stageData.stage.STATUS_ID,
        });
        return true;
    }

    async delete(id: number): Promise<boolean> {
        console.log('DELETE SMART id', id);
        const entityTypeId = this.targetSmart.entityTypeId.toString();

        await this.bitrix.item.delete(id, entityTypeId);
        return true;
    }

    private getSmartActType(portal: PortalModel) {
        const targetSmart = portal.getSmartByType('service_act');
        return targetSmart;
    }

    /** Например: «с 1 апреля 2026 по 31 апреля 2026» */
    private formatActPeriodTitle(fromIso: string, toIso: string): string {
        const fromLabel = this.formatRuCalendarDate(fromIso);
        const toLabel = this.formatRuCalendarDate(toIso);
        return `с ${fromLabel} по ${toLabel}`;
    }

    private formatRuCalendarDate(iso: string): string {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            return iso;
        }
        const s = new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(d);
        return s.replace(/\s*г\.?\s*$/u, '').trim();
    }
}
