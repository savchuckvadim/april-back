import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EventReportContext } from '../context/event-report.context';
import { EEventReportEntityType } from '../init/event-report-init.types';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../entity/event-report-entity-fields.model';
import {
    composeStageId,
    detectEventFromBaseStage,
    getSalesBaseTargetStageCode,
} from './deal-target-stage.calculator';

/**
 * Обновление/создание сделки воронки ОП Основная (sales_base).
 *
 * Возвращает идентификатор сделки (реальный либо `$result[set_base_deal]`),
 * чтобы task/list-flow могли сослаться на неё в том же batch.
 */
export class SalesBaseDealService {
    private readonly logger = new Logger(SalesBaseDealService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): string | null {
        if (ctx.isPostSale) return null;
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            this.logger.warn('sales_base category not configured');
            return null;
        }

        const targetStage = getSalesBaseTargetStageCode({
            category,
            currentStageEvent: detectEventFromBaseStage(
                category,
                ctx.currentBaseDeal?.STAGE_ID,
            ),
            planEventType: ctx.planEventType,
            reportEventType: ctx.reportEventType,
            isResult: ctx.isResult,
            isUnplanned: ctx.isUnplannedPresentation,
            isSuccess: ctx.isSuccessSale,
            isFail: ctx.isFail,
            isNoResult: ctx.isNoResult,
            isNotCa: ctx.isNotCa,
        });
        if (!targetStage) {
            this.logger.warn('sales_base target stage not resolved');
            return ctx.currentBaseDeal ? String(ctx.currentBaseDeal.ID) : null;
        }

        const entityFields = new EventReportEntityFieldsModel(
            this.portal,
            ctx,
            EEventReportEntityType.DEAL,
            {
                deal: ctx.currentBaseDeal as Record<string, unknown> | null,
                role: EDealRole.BASE,
            },
        ).toFields();

        const baseFields: Partial<IBXDeal> = {
            ...(entityFields as Partial<IBXDeal>),
            ...ctx.ownerLinkFields,
            ...this.saleFields(ctx),
            ...this.failFields(ctx),
            CATEGORY_ID: String(category.bitrixId),
            STAGE_ID: composeStageId(category.bitrixId, targetStage),
            ASSIGNED_BY_ID: String(ctx.planResponsibleId),
        };

        if (ctx.currentBaseDeal) {
            const cmd = `update_base_deal_${ctx.currentBaseDeal.ID}`;
            this.bitrix.batch.deal.update(
                cmd,
                Number(ctx.currentBaseDeal.ID),
                baseFields,
            );
            return String(ctx.currentBaseDeal.ID);
        }

        const cmd = 'set_base_deal';
        this.bitrix.batch.deal.set(cmd, baseFields);
        return `$result[${cmd}]`;
    }

    /**
     * Поля продажи из чек-листа (SaleDto): сумма → штатный OPPORTUNITY
     * (+ IS_MANUAL_OPPORTUNITY, иначе Bitrix пересчитает её из товарных
     * позиций), дата первой оплаты → pbx-поле `first_pay_date`
     * (konstructor-реестр; не установлено — молча пропускаем, graceful).
     */
    private saleFields(ctx: EventReportContext): Record<string, string> {
        if (!ctx.isSuccessSale) return {};
        const sale = ctx.dto.sale;
        const fields: Record<string, string> = {};

        if (typeof sale?.opportunity === 'number' && sale.opportunity > 0) {
            fields['OPPORTUNITY'] = String(sale.opportunity);
            fields['IS_MANUAL_OPPORTUNITY'] = 'Y';
        }

        if (sale?.firstPayDate) {
            const field = this.portal.getEntityFieldByCode(
                'deal',
                'first_pay_date',
            );
            if (field) {
                fields[this.portal.getFieldBitrixId(field)] = sale.firstPayDate;
            }
        }

        return fields;
    }

    /**
     * Поля отказа для реанимации отказников (sales-hooks/reject-revive):
     * дата следующего звонка после отказа (withPostFail-порталы) + очистка
     * маркеров реанимации — повторный отказ обязан реанимироваться заново
     * через интервал, а не считаться «уже отправленным». Поля не установлены
     * на портале — graceful-пропуск (фича сама молчит).
     */
    private failFields(ctx: EventReportContext): Record<string, string> {
        if (!ctx.isFail) return {};
        const fields: Record<string, string> = {};

        const set = (code: string, value: string) => {
            const field = this.portal.getEntityFieldByCode('deal', code);
            if (field) fields[this.portal.getFieldBitrixId(field)] = value;
        };

        const postFailDate = ctx.dto.fail?.postFailDate;
        if (postFailDate) set('post_fail_date', postFailDate);
        set('op_xo_revive_queued_at', '');
        set('op_xo_revive_sent_at', '');

        return fields;
    }
}
