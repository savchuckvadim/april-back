import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import { EEventReportEntityType } from '../../event-report/services/init/event-report-init.types';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../../event-report/services/entity/event-report-entity-fields.model';
import {
    composeStageId,
    detectEventFromTmcStage,
    getTmcTargetStageCode,
} from '../../event-report/services/deal/deal-target-stage.calculator';
import { DealFlowResult } from '../../event-report/services/deal/event-report-deal-flow.service';

/**
 * Ключ batch-команды создания ТМЦ-сделки: по нему из ответа батча читается
 * реальный id (его забирает заявка на презентацию в смарте).
 */
export const SET_TMC_DEAL_CMD = 'set_tmc_deal';

const EMPTY_RESULT: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

/**
 * Сделка «ТМЦ Основная» (tmc_base) в режиме «Менеджер ТМЦ» — единственная
 * сделка, которую двигает поток ТМЦ (зеркало легаси `getNEWBatchDealFlow`,
 * ветка `tmc_base`).
 *
 *  - есть открытая ТМЦ-сделка (`ctx.currentBaseDeal` в ТМЦ-контексте) —
 *    обновляем: стадия по лестнице ТМЦ, поля карточки ролью `tmc`,
 *    ответственный — ответственный плана;
 *  - нет — создаём на компанию, остальные команды батча ссылаются на неё
 *    подстановкой `$result[set_tmc_deal]` (как у основной сделки ОП).
 *
 * Стадия: легаси считало «результативным» и отчёт по НОВОЙ задаче
 * (`isResult || isNew`) — иначе план по свежей задаче уводил бы сделку в
 * «Не состоялась».
 *
 * Не @Injectable — создаётся с per-domain bitrix (правило CLAUDE.md).
 */
export class TmcBaseDealService {
    private readonly logger = new Logger(TmcBaseDealService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): DealFlowResult {
        if (!ctx.isDealFlow) return { ...EMPTY_RESULT };
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.tmc_base,
        );
        if (!category) {
            this.logger.warn(`${ctx.domain}: воронка tmc_base не настроена`);
            return { ...EMPTY_RESULT };
        }

        const current = ctx.currentBaseDeal;
        const stage = getTmcTargetStageCode({
            category,
            currentStageEvent: detectEventFromTmcStage(
                category,
                current?.STAGE_ID,
            ),
            planEventType: ctx.planEventType,
            reportEventType: ctx.reportEventType,
            isResult: ctx.isResult || ctx.isNew,
            isSuccess: ctx.isSuccessSale,
            isFail: ctx.isFail,
            isExpired: ctx.isExpired,
        });
        if (!stage) {
            this.logger.warn(
                `${ctx.domain}: целевая стадия tmc_base не определена — сделка не двигается`,
            );
            return {
                ...EMPTY_RESULT,
                baseDealId: current ? String(current.ID) : null,
            };
        }

        const entityFields = new EventReportEntityFieldsModel(
            this.portal,
            ctx,
            EEventReportEntityType.DEAL,
            {
                deal: current as Record<string, unknown> | null,
                role: EDealRole.TMC,
            },
        ).toFields();
        const fields: Partial<IBXDeal> = {
            ...(entityFields as Partial<IBXDeal>),
            ...ctx.ownerLinkFields,
            CATEGORY_ID: String(category.bitrixId),
            STAGE_ID: composeStageId(category.bitrixId, stage),
            // Как в легаси: ТМЦ-сделка всегда за ответственным плана.
            ASSIGNED_BY_ID: String(ctx.planResponsibleId),
        };

        if (current) {
            this.bitrix.batch.deal.update(
                `update_tmc_deal_${current.ID}`,
                Number(current.ID),
                fields,
            );
            return { ...EMPTY_RESULT, baseDealId: String(current.ID) };
        }

        this.bitrix.batch.deal.set(SET_TMC_DEAL_CMD, {
            ...fields,
            ...this.newDealClientFields(ctx),
        });
        return { ...EMPTY_RESULT, baseDealId: `$result[${SET_TMC_DEAL_CMD}]` };
    }

    /**
     * Новая ТМЦ-сделка: название по компании (легаси оставляло «Сделка #N»)
     * и контакт плана/отчёта — чтобы карточка читалась без открытия компании.
     */
    private newDealClientFields(ctx: EventReportContext): Partial<IBXDeal> {
        const fields: Partial<IBXDeal> = {};
        const companyTitle = ctx.company?.TITLE
            ? String(ctx.company.TITLE).trim()
            : '';
        if (companyTitle) fields.TITLE = `ТМЦ: ${companyTitle}`;
        const contactId =
            Number(ctx.planContact?.ID ?? ctx.reportContact?.ID) || 0;
        if (contactId) fields.CONTACT_ID = String(contactId);
        return fields;
    }
}
