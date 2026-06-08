import {
    ISmartActItemsByDealResult,
    TStageType,
} from './smart-act-gsr.service';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    CategorySmartActService,
    IGetStageData,
} from './category-smart-act.service';
import { BitrixService, IBXItem } from '@/modules/bitrix';
import { IPSmart } from '@lib/portal-lib/portal/interfaces/portal.interface';

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
        const stageData = await this.resolveStageData(dto.stageType);
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

    /**
     * Двигает акт в целевую стадию ТОЛЬКО вперёд по жизненному циклу (по SORT стадии):
     * planned(Запланирован) → inwork(Выписан) → success(Сдан).
     * Если акт уже в целевой стадии или дальше (в т.ч. ручные «У клиента»/«Оплачен» при цели inwork,
     * или уже «Сдан») — не трогаем, чтобы не откатывать назад и не реанимировать закрытый акт.
     * @returns true, если стадия была изменена.
     */
    async ensureStageForward(
        id: number,
        currentStageId: string | null,
        targetStageType: TStageType,
    ): Promise<boolean> {
        const target = await this.resolveStageData(targetStageType);
        if (!target.stage?.STATUS_ID) {
            return false;
        }
        const targetSort = this.toSortNumber(target.stage.SORT);
        const sortByStatusId = await this.getStageSortByStatusId();
        const currentSort =
            currentStageId != null
                ? sortByStatusId.get(currentStageId)
                : undefined;
        // Уже в целевой стадии или дальше по процессу — ничего не делаем.
        if (currentSort != null && currentSort >= targetSort) {
            return false;
        }
        console.log('MOVE SMART STAGE id', id, '->', target.stage.STATUS_ID);
        await this.bitrix.item.update(id, this.targetSmart.entityTypeId, {
            stageId: target.stage.STATUS_ID,
        });
        return true;
    }

    /** Стадия по роли жизненного цикла (для создания акта и для переходов). */
    private async resolveStageData(
        stageType: TStageType,
    ): Promise<IGetStageData> {
        const stagesData =
            await this.categorySmartActService.getSmartStageDataForCreate(
                this.domain,
                this.targetSmart,
            );
        switch (stageType) {
            case 'new':
                return stagesData.new;
            case 'planned':
                return stagesData.planned;
            case 'inwork':
                return stagesData.inwork;
            case 'success':
            case 'fail':
            default:
                return stagesData.success;
        }
    }

    /** STATUS_ID → SORT по стадиям категории смарта (для ранжирования переходов). */
    private async getStageSortByStatusId(): Promise<Map<string, number>> {
        const data = await this.categorySmartActService.getCategorySmartAct(
            this.domain,
            this.targetSmart,
        );
        const map = new Map<string, number>();
        for (const stage of data.stages) {
            if (stage.STATUS_ID != null) {
                map.set(stage.STATUS_ID, this.toSortNumber(stage.SORT));
            }
        }
        return map;
    }

    private toSortNumber(sort: number | string | undefined): number {
        const n = Number(sort);
        return Number.isFinite(n) ? n : 0;
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
