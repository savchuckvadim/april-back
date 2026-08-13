import { Injectable, Logger } from '@nestjs/common';
import { getErrorDetails } from '@/shared';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import { LeadRequestAcceptService } from '../../../lead-request/services/lead-request-accept.service';
import { LeadRequestAcceptResultDto } from '../../../lead-request/dto/lead-request-accept.dto';

type BxRow = Record<string, unknown>;

/** Элемент пачки принятия (робот шлёт leadId ЛИБО dealId). */
export interface ILeadAcceptItem {
    leadId?: number;
    dealId?: number;
    userId?: number;
}

/** Результат пачки принятий. */
export interface LeadAcceptBatchResult {
    implemented: true;
    items: (LeadRequestAcceptResultDto & {
        leadId?: number;
        error?: string;
    })[];
    message: string;
}

/**
 * Хук принятия заявки — с ПАЧЕЧНОЙ ПРЕДОБРАБОТКОЙ (правило sales-hooks:
 * хук = потенциально ×100–200 вызовов, поэтому всё, что каждому элементу
 * нужно в начале, читается ОДНИМ batch-заходом на всю пачку):
 *
 *   Волна 1 (1 HTTP): batch deal.get для элементов с dealId → leadId
 *                     по связям (deal_from_lead_id/LEAD_ID);
 *   Волна 2 (1 HTTP): batch lead.get всех лидов пачки;
 *   Расчёт:           LeadRequestAcceptService.plan() на каждый лид —
 *                     чистая функция, ноль вызовов;
 *   Запись:           lead.update + deal.update группами через буфер
 *                     каркаса (⌈2N/50⌉ HTTP).
 *
 * Итого пачка ЛЮБОГО размера = 2 чтения + пара записей, а не N×(2–4)
 * одиночных вызовов. Одиночная кнопка UI ходит в /lead-request/accept
 * напрямую — ей предобработка не нужна.
 */
@Injectable()
export class LeadAcceptUseCase
    implements ISalesHookUseCase<ILeadAcceptItem, LeadAcceptBatchResult>
{
    readonly hook = EnumSalesHookCode.LEAD_ACCEPT;
    private readonly logger = new Logger(LeadAcceptUseCase.name);

    constructor(private readonly acceptService: LeadRequestAcceptService) {}

    async execute(
        ctx: SalesHookExecutionContext,
        items: ILeadAcceptItem[],
    ): Promise<LeadAcceptBatchResult> {
        const results: LeadAcceptBatchResult['items'] = [];

        // === Волна 1: сделки элементов без leadId — одним batch'ем.
        const dealsById = await this.prefetchDeals(ctx, items);

        // leadId каждого элемента: явный либо по связям его сделки.
        const resolved = items.map(item => ({
            item,
            leadId:
                item.leadId ??
                this.acceptService.leadIdFromDealRow(
                    ctx.portal,
                    item.dealId ? dealsById.get(item.dealId) : undefined,
                ),
        }));

        // === Волна 2: все лиды пачки — одним batch'ем.
        const leadsById = await this.prefetchLeads(
            ctx,
            resolved
                .map(entry => entry.leadId)
                .filter((id): id is number => !!id),
        );

        /*
         * === Волна 3: базовые сделки лидов (те, что ещё не прочитаны в
         * волне 1). Нужны из-за зеркальной истории: она пишется в
         * multiple-поле сделки, а его update перезаписывает целиком —
         * без текущего значения прошлая история сделки стёрлась бы.
         */
        const baseDealIds = resolved
            .map(({ item, leadId }) => {
                const lead = leadId ? leadsById.get(leadId) : undefined;
                return lead
                    ? this.acceptService.baseDealIdOf(
                          ctx.portal,
                          lead,
                          item.dealId,
                      )
                    : null;
            })
            .filter((id): id is number => !!id && !dealsById.has(id));
        for (const [dealId, row] of await this.prefetchDealsByIds(
            ctx,
            baseDealIds,
        )) {
            dealsById.set(dealId, row);
        }

        // === Расчёт планов (чисто) + batch-запись через буфер каркаса.
        let accepted = 0;
        for (const { item, leadId } of resolved) {
            if (!leadId) {
                results.push(
                    this.failure(
                        item,
                        `У сделки ${item.dealId} не найден лид-первоисточник`,
                    ),
                );
                continue;
            }
            const lead = leadsById.get(leadId);
            if (!lead) {
                results.push(
                    this.failure(item, `Лид ${leadId} не найден на портале`),
                );
                continue;
            }

            try {
                const baseDealId = this.acceptService.baseDealIdOf(
                    ctx.portal,
                    lead,
                    item.dealId,
                );
                const plan = this.acceptService.plan(
                    ctx.portal,
                    lead,
                    item.userId,
                    item.dealId,
                    baseDealId ? (dealsById.get(baseDealId) ?? null) : null,
                );
                if (!plan.already && Object.keys(plan.fields).length > 0) {
                    ctx.buffer.queue(() =>
                        ctx.bitrix.batch.lead.update(
                            `la_lead_${leadId}`,
                            leadId,
                            plan.fields as never,
                        ),
                    );
                    if (plan.dealUpdate) {
                        const update = plan.dealUpdate;
                        ctx.buffer.queue(() =>
                            ctx.bitrix.batch.deal.update(
                                `la_deal_${update.dealId}`,
                                update.dealId,
                                update.fields as never,
                            ),
                        );
                    }
                    await ctx.buffer.endGroup();
                    accepted += 1;
                }
                results.push({
                    leadId,
                    success: true,
                    already: plan.already,
                    firstprepareSeconds: plan.firstprepareSeconds,
                    warnings: plan.warnings,
                });
            } catch (error) {
                const { message } = getErrorDetails(error);
                this.logger.warn(`lead-accept: лид ${leadId} — ${message}`);
                results.push(this.failure(item, message, leadId));
            }
        }

        await ctx.buffer.flush();
        return {
            implemented: true,
            items: results,
            message: `Принятий зафиксировано: ${accepted} из ${results.length}.`,
        };
    }

    /** Волна 1: batch deal.get для всех элементов с dealId (1 HTTP). */
    private async prefetchDeals(
        ctx: SalesHookExecutionContext,
        items: ILeadAcceptItem[],
    ): Promise<Map<number, BxRow>> {
        return this.prefetchDealsByIds(
            ctx,
            items
                .filter(item => !item.leadId && item.dealId)
                .map(item => item.dealId!),
        );
    }

    /** batch deal.get по списку id — одна волна на любое количество. */
    private async prefetchDealsByIds(
        ctx: SalesHookExecutionContext,
        ids: number[],
    ): Promise<Map<number, BxRow>> {
        const dealIds = [...new Set(ids)];
        const map = new Map<number, BxRow>();
        if (!dealIds.length) return map;

        for (const dealId of dealIds) {
            ctx.bitrix.batch.deal.get(`la_deal_get_${dealId}`, dealId);
        }
        const chunks = await ctx.bitrix.api.callBatchWithConcurrency(1);
        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                const match = /^la_deal_get_(\d+)$/.exec(cmd);
                if (match && value && typeof value === 'object') {
                    map.set(Number(match[1]), value as BxRow);
                }
            }
        }
        return map;
    }

    /** Волна 2: batch lead.get всех лидов пачки (1 HTTP). */
    private async prefetchLeads(
        ctx: SalesHookExecutionContext,
        leadIds: number[],
    ): Promise<Map<number, BxRow>> {
        const unique = [...new Set(leadIds)];
        const map = new Map<number, BxRow>();
        if (!unique.length) return map;

        for (const leadId of unique) {
            ctx.bitrix.batch.lead.get(`la_lead_get_${leadId}`, leadId);
        }
        const chunks = await ctx.bitrix.api.callBatchWithConcurrency(1);
        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                const match = /^la_lead_get_(\d+)$/.exec(cmd);
                if (match && value && typeof value === 'object') {
                    map.set(Number(match[1]), value as BxRow);
                }
            }
        }
        return map;
    }

    private failure(
        item: ILeadAcceptItem,
        error: string,
        leadId?: number,
    ): LeadAcceptBatchResult['items'][number] {
        return {
            leadId: leadId ?? item.leadId,
            success: false,
            already: false,
            firstprepareSeconds: null,
            warnings: [],
            error,
        };
    }
}
