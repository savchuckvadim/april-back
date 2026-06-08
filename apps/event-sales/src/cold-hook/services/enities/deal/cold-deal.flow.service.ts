import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { Logger } from '@nestjs/common';
import { ColdPortalDealModel } from './cold-portal-deal.model';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { ColdHookBatchGroupBuffer } from '../../batch/cold-hook-batch-group-buffer';
import { IColdCallBxEntityData } from '../entity/cold-call-bx-entity.flow.service';
import { EventEntityModel } from '../entity/event-entity.model';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';

interface IColdDealFlowResult {
    baseDealId: string;
    xoDealId: string;
}

export class ColdDealFlowService {
    private readonly logger = new Logger(ColdDealFlowService.name);
    private portlDealModel: ColdPortalDealModel;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {
        this.portlDealModel = new ColdPortalDealModel(this.portal);
    }

    public flow(
        data: IColdCallBxEntityData,
        companyId: number,
        baseDeal: IBXDeal | null,
        buffer: ColdHookBatchGroupBuffer,
    ): IColdDealFlowResult {
        const baseDealId = this.prepareBaseDeal(
            data,
            companyId,
            baseDeal,
            buffer,
        );
        const xoDealId = this.createXoDeal(data, companyId, buffer);

        return { baseDealId, xoDealId };
    }

    private prepareBaseDeal(
        data: IColdCallBxEntityData,

        companyId: number,
        baseDeal: IBXDeal | null,
        buffer: ColdHookBatchGroupBuffer,
    ) {
        const setBaseDealKey = `new_base_deal_${companyId}`;
        const updateBaseDealKey = `update_base_deal_${baseDeal?.ID}`;
        const { name, deadline, responsibleId, xoCreated } = data;
        const targetBase = this.portlDealModel.getTargetStageBitrixId(
            PbxDealCategoryCodeEnum.sales_base,
        );

        if (targetBase) {
            const baseDealEntity = new EventEntityModel(
                this.portal,
                baseDeal,
                EnumColdCallEntityType.DEAL,
                name,
                deadline,
                responsibleId,
                xoCreated,
            );
            const baseDealEntityieldValues = baseDealEntity.getNextValues();

            const baseUpdateDealData: Partial<IBXDeal> = {
                CATEGORY_ID: targetBase.categoryId,
                STAGE_ID: targetBase.stageId,
                ASSIGNED_BY_ID: responsibleId.toString(),
                COMPANY_ID: companyId.toString(),
                ...baseDealEntityieldValues,
            };

            if (baseDeal) {
                this.logger.log(
                    `[DEADLINE][deal][SEND] base deal.update company=${companyId} ` +
                        `cmdKey=${updateBaseDealKey} dealId=${baseDeal.ID} ` +
                        `deadlineCrm="${deadline.toCrmDateTime()}" (локаль портала) ` +
                        `payload=${JSON.stringify(baseUpdateDealData)}`,
                );
                buffer.queue(() =>
                    this.bitrix.batch.deal.update(
                        updateBaseDealKey,
                        Number(baseDeal.ID),
                        {
                            ...baseUpdateDealData,
                            ...baseDealEntity.getNextValues(),
                        },
                    ),
                );
            } else {
                this.logger.log(
                    `[DEADLINE][deal][SEND] base deal.set company=${companyId} ` +
                        `cmdKey=${setBaseDealKey} ` +
                        `deadlineCrm="${deadline.toCrmDateTime()}" (локаль портала) ` +
                        `payload=${JSON.stringify(baseUpdateDealData)}`,
                );
                buffer.queue(() =>
                    this.bitrix.batch.deal.set(
                        setBaseDealKey,
                        baseUpdateDealData,
                    ),
                );
            }
        }

        return baseDeal
            ? String(baseDeal.ID)
            : this.getDealIdByBatchCommandKey(setBaseDealKey);
    }

    private createXoDeal(
        data: IColdCallBxEntityData,
        companyId: number,
        buffer: ColdHookBatchGroupBuffer,
    ) {
        const createColdKey = `new_cold_deal_${companyId}`;
        const { name, deadline, responsibleId, xoCreated } = data;

        const targetCold = this.portlDealModel.getTargetStageBitrixId(
            PbxDealCategoryCodeEnum.sales_xo,
        );

        if (targetCold) {
            const coldDealEntity = new EventEntityModel(
                this.portal,
                null,
                EnumColdCallEntityType.DEAL,
                name,
                deadline,
                responsibleId,
                xoCreated,
            );
            const coldDealEntityFieldValues = coldDealEntity.getNextValues();
            const coldAddDealData: Partial<IBXDeal> = {
                TITLE: coldDealEntity.getEventName(),
                CATEGORY_ID: targetCold.categoryId,
                STAGE_ID: targetCold.stageId,
                ASSIGNED_BY_ID: responsibleId.toString(),
                COMPANY_ID: companyId.toString(),
                ...coldDealEntityFieldValues,
            };
            this.logger.log(
                `[DEADLINE][deal][SEND] cold deal.set company=${companyId} ` +
                    `cmdKey=${createColdKey} ` +
                    `deadlineCrm="${deadline.toCrmDateTime()}" (локаль портала) ` +
                    `payload=${JSON.stringify(coldAddDealData)}`,
            );
            buffer.queue(() =>
                this.bitrix.batch.deal.set(createColdKey, coldAddDealData),
            );
        }

        return this.getDealIdByBatchCommandKey(createColdKey);
    }

    /**
     * Формат строки-ссылки на $result батча. Bitrix подставляет такой токен
     * И когда значение поля = ровно `$result[key]`, И когда это подстрока
     * (например `D_$result[key]` в crm-поле списочного элемента). Кавычки
     * вокруг ключа ломают подстановку в lists.element.add (поле "CRM" возвращает
     * ERROR_ELEMENT_FIELD_VALUE), поэтому используем bare-форму как в legacy PHP.
     */
    private getDealIdByBatchCommandKey(key: string): string {
        return `$result[${key}]`;
    }
}
