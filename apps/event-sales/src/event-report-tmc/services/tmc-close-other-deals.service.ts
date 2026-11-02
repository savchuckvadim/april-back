import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import { EEventReportEntityType } from '../../event-report/services/init/event-report-init.types';
import { composeStageId } from '../../event-report/services/deal/deal-target-stage.calculator';

/**
 * Части кодов ЗАКРЫТЫХ стадий. Легаси-правило (`closeNoTMCDeals`): открытой
 * считается стадия, в коде которой нет `fail`/`noresult`/`double`/`success`.
 * Финалы, появившиеся после легаси («Не ЦА», «Не беспокоить», «Заявка
 * отклонена»), добавлены — иначе закрытая сделка уехала бы в «Не состоялась».
 */
const CLOSED_STAGE_CODE_PARTS = [
    'fail',
    'noresult',
    'double',
    'success',
    'not_ca',
    'not_call',
    'rejected',
    'apology',
] as const;

/**
 * Стадия, в которую легаси уводило лишние открытые сделки, — `APOLOGY`
 * («Не состоялась») ЛЮБОЙ воронки. На портале проверяется по слепку: нет
 * такой стадии в воронке — её сделки не трогаем.
 */
export const APOLOGY_STAGE_BITRIX_ID = 'APOLOGY';

/** Стадия открыта — по коду, как считало легаси. */
export const isOpenStageCode = (code: string): boolean =>
    !CLOSED_STAGE_CODE_PARTS.some(part => code.includes(part));

/**
 * «У менеджера ТМЦ по компании одна живая сделка» — зеркало легаси
 * `closeNoTMCDeals`: ДО основного батча прямыми вызовами все открытые
 * сделки компании у ответственного плана уводятся в «Не состоялась»
 * (`C{воронка}:APOLOGY`), кроме текущей ТМЦ-сделки. Воронка tmc_base
 * чистится только когда текущая ТМЦ-сделка есть — иначе закрылась бы та,
 * которую отчёт собирается обновлять.
 *
 * Прямые вызовы, а не батч: список сделок нужен до постановки команд, а
 * ошибки одной сделки не должны ронять отчёт — они логируются.
 *
 * Не @Injectable — создаётся с per-domain bitrix (правило CLAUDE.md).
 */
export class TmcCloseOtherDealsService {
    private readonly logger = new Logger(TmcCloseOtherDealsService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /** Сколько сделок закрыто. */
    async apply(ctx: EventReportContext): Promise<number> {
        if (!ctx.isDealFlow) return 0;
        if (ctx.entityType !== EEventReportEntityType.COMPANY) return 0;
        const responsibleId = ctx.planResponsibleId;
        if (!responsibleId) return 0;
        const currentTmcId = Number(ctx.currentBaseDeal?.ID) || null;

        let closed = 0;
        for (const category of this.portal.getDealCategories()) {
            const isTmc =
                (category.code as PbxDealCategoryCodeEnum) ===
                PbxDealCategoryCodeEnum.tmc_base;
            if (isTmc && !currentTmcId) continue;
            const apology = category.stages.find(
                stage => stage.bitrixId === APOLOGY_STAGE_BITRIX_ID,
            );
            if (!apology) continue;
            const openStages = category.stages
                .filter(stage => stage.code && isOpenStageCode(stage.code))
                .map(stage =>
                    composeStageId(category.bitrixId, stage.bitrixId),
                );
            if (!openStages.length) continue;

            const deals = await this.listOpenDeals(
                ctx,
                responsibleId,
                openStages,
                isTmc ? currentTmcId : null,
            );
            for (const deal of deals) {
                const dealId = Number(deal.ID);
                if (!dealId || dealId === currentTmcId) continue;
                try {
                    await this.bitrix.deal.update(dealId, {
                        STAGE_ID: composeStageId(
                            category.bitrixId,
                            apology.bitrixId,
                        ),
                    });
                    closed++;
                } catch (error) {
                    this.logger.warn(
                        `${ctx.domain}: сделка ${dealId} не закрыта в «Не состоялась» — ${(error as Error).message}`,
                    );
                }
            }
        }
        if (closed) {
            this.logger.log(
                `${ctx.domain}: ТМЦ-отчёт по компании ${ctx.entityId} закрыл ` +
                    `${closed} лишних открытых сделок менеджера ${responsibleId}`,
            );
        }
        return closed;
    }

    private async listOpenDeals(
        ctx: EventReportContext,
        responsibleId: number,
        stageIds: string[],
        excludeDealId: number | null,
    ): Promise<IBXDeal[]> {
        const filter: Record<string, unknown> = {
            COMPANY_ID: ctx.entityId,
            ASSIGNED_BY_ID: responsibleId,
            STAGE_ID: stageIds,
        };
        if (excludeDealId) filter['!=ID'] = excludeDealId;
        try {
            const response = (await this.bitrix.deal.getList(
                filter as unknown as Partial<IBXDeal>,
                ['ID', 'CATEGORY_ID', 'STAGE_ID'],
            )) as { result?: IBXDeal[] } | null;
            return response?.result ?? [];
        } catch (error) {
            this.logger.warn(
                `${ctx.domain}: открытые сделки компании ${ctx.entityId} не прочитаны — ${(error as Error).message}`,
            );
            return [];
        }
    }
}
