import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { IBatchGroupBuffer } from '../../../../shared/batch/batch-group-buffer.interface';
import { ResolvedLeadToWorkItem } from '../../dto/lead-to-work.dto';
import { LeadToWorkContext } from '../lead-to-work-context.service';
import { LeadToWorkStagePlan } from '../lead-to-work-stage.resolver';
import { BxRow, LeadToWorkFlowBase } from './lead-to-work-flow.base';

/** Итог сведения сделок лида к одной открытой паре. */
export interface DealConsolidationResult {
    /** Контекст с главной основной и главной ХО-сделкой. */
    ctx: LeadToWorkContext;
    /** Сколько лишних ОТКРЫТЫХ сделок закрыто в fail. */
    closed: number;
    warnings: string[];
}

/**
 * ИНВАРИАНТ «одна открытая пара» (как в классическом ХО): у лида не может
 * копиться по паре сделок на каждый прогон хука.
 *
 *  - кандидаты: to_base_sales/to_xo_sales лида + свои по deal_from_lead_id
 *    + конвертационные по LEAD_ID (дедуп по ID);
 *  - главная основная/ХО = ссылка лида, если жива, иначе ПОСЛЕДНЯЯ
 *    открытая своей воронки (max ID);
 *  - остальные ОТКРЫТЫЕ сделки этих воронок закрываются в fail-стадию
 *    («не состоялась»); fail не сопоставлена → warning, не трогаем.
 *
 * Закрытые сделки не трогаются никогда (прошлое не переписываем).
 */
export class DealConsolidationService extends LeadToWorkFlowBase {
    consolidate(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        buffer: IBatchGroupBuffer,
    ): DealConsolidationResult {
        const warnings: string[] = [];
        const byId = this.candidatesById(ctx);

        const baseOpen = this.openOf(byId, plan.dealCategoryId);
        const xoOpen = this.openOf(byId, plan.xoCategoryId);
        const mainBase = this.pickMain(
            ctx.existingOurDeal as unknown as BxRow | null,
            baseOpen,
        );
        const mainXo = this.pickMain(
            ctx.existingXoDeal as unknown as BxRow | null,
            xoOpen,
        );

        let closed = this.closeExtras(
            item,
            baseOpen,
            mainBase,
            PbxDealCategoryCodeEnum.sales_base,
            buffer,
            warnings,
        );
        closed += this.closeExtras(
            item,
            xoOpen,
            mainXo,
            PbxDealCategoryCodeEnum.sales_xo,
            buffer,
            warnings,
        );
        if (closed > 0) {
            this.logger.log(
                `[consolidate] lead=${item.leadId}: лишних открытых сделок закрыто в fail: ${closed}`,
            );
        }

        return {
            ctx: {
                ...ctx,
                existingOurDeal: mainBase as unknown as
                    | LeadToWorkContext['existingOurDeal']
                    | null,
                existingXoDeal: mainXo as unknown as
                    | LeadToWorkContext['existingXoDeal']
                    | null,
            },
            closed,
            warnings,
        };
    }

    /* ------------------------------------------------------------------ */

    /** Все известные сделки лида без дублей по ID. */
    private candidatesById(ctx: LeadToWorkContext): Map<number, BxRow> {
        const byId = new Map<number, BxRow>();
        const candidates = [
            ctx.existingOurDeal,
            ctx.existingXoDeal,
            ...ctx.convertedDeals,
            ...ctx.fromLeadDeals,
        ];
        for (const deal of candidates) {
            if (!deal) continue;
            const row = deal as unknown as BxRow;
            const id = Number(row.ID);
            if (Number.isFinite(id) && id > 0 && !byId.has(id)) {
                byId.set(id, row);
            }
        }
        return byId;
    }

    private isOpen(row: BxRow): boolean {
        return this.text(row.CLOSED)?.toUpperCase() !== 'Y';
    }

    /** Открытые сделки воронки по возрастанию ID (последняя — свежая). */
    private openOf(
        byId: Map<number, BxRow>,
        categoryId: string | undefined,
    ): BxRow[] {
        if (!categoryId) return [];
        return [...byId.values()]
            .filter(
                row =>
                    this.text(row.CATEGORY_ID) === categoryId &&
                    this.isOpen(row),
            )
            .sort((a, b) => Number(a.ID) - Number(b.ID));
    }

    /** Главная сделка: живая ссылка лида, иначе последняя открытая. */
    private pickMain(linked: BxRow | null, open: BxRow[]): BxRow | null {
        if (linked && this.isOpen(linked)) return linked;
        return open.length ? open[open.length - 1] : null;
    }

    /** Закрывает все открытые сделки воронки, кроме главной. */
    private closeExtras(
        item: ResolvedLeadToWorkItem,
        open: BxRow[],
        main: BxRow | null,
        categoryCode: PbxDealCategoryCodeEnum,
        buffer: IBatchGroupBuffer,
        warnings: string[],
    ): number {
        const extras = open.filter(
            row => !main || this.text(row.ID) !== this.text(main.ID),
        );
        if (!extras.length) return 0;

        const failStageId = this.failStageId(categoryCode);
        if (!failStageId) {
            warnings.push(
                `Fail-стадия воронки ${categoryCode} не сопоставлена — лишние открытые сделки (${extras.length}) не закрыты`,
            );
            return 0;
        }
        for (const row of extras) {
            const dealId = Number(row.ID);
            const cmd = `lw_close_extra_${item.leadId}_${dealId}`;
            buffer.queue(() =>
                this.bitrix.batch.deal.update(cmd, dealId, {
                    STAGE_ID: failStageId,
                } as never),
            );
        }
        return extras.length;
    }

    /** `C{cat}:{fail}` по коду воронки; нет fail-стадии в db → null. */
    private failStageId(categoryCode: PbxDealCategoryCodeEnum): string | null {
        const category = this.portal.getDealCategoryByCode(categoryCode);
        if (!category) return null;
        const stage = category.stages.find(st => st.code.endsWith('_fail'));
        return stage ? `C${category.bitrixId}:${stage.bitrixId}` : null;
    }
}
