import { Injectable, Logger } from '@nestjs/common';
import { getErrorDetails } from '@/shared';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import { LeadRequestAcceptService } from '../../../lead-request/services/lead-request-accept.service';
import { LeadAcceptPlan } from '../../../lead-request/services/lead-accept-plan';
import { LeadRequestAcceptResultDto } from '../../../lead-request/dto/lead-request-accept.dto';
import {
    IWorkTakeoverOutcome,
    WorkTakeoverService,
} from '../../../shared/work-takeover';
import { acceptActorIds } from '../../../shared/lead-request/accept-actor.util';
import { UserNameResolver } from '../../../shared/lead-request/user-name.resolver';

type BxRow = Record<string, unknown>;

/** Элемент пачки с рассчитанным планом — между расчётом и записью. */
interface IPlannedAccept {
    item: ILeadAcceptItem;
    leadId: number;
    plan: LeadAcceptPlan;
}

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
 *   Волна 1 (⌈N/50⌉ HTTP): batch deal.get для элементов с dealId → leadId
 *                     по связям (deal_from_lead_id/LEAD_ID);
 *   Волна 2 (⌈N/50⌉ HTTP): batch lead.get всех лидов пачки;
 *   Волна 3 (⌈N/50⌉ HTTP): batch deal.get базовых сделок лидов, не
 *                     прочитанных в волне 1 (зеркальная история сделки);
 *   Имена (≤⌈N/50⌉ HTTP, кэш на час): UserNameResolver — принявшие в
 *                     истории по имени;
 *   Расчёт:           LeadRequestAcceptService.plan() на каждый лид —
 *                     чистая функция, ноль вызовов;
 *   Запись:           lead.update + deal.update группами через буфер
 *                     каркаса (⌈2N/50⌉ HTTP).
 *
 * Итого пачка ЛЮБОГО размера = несколько batch-чтений + пара записей, а не
 * N×(2–4) одиночных вызовов. Одиночная кнопка UI ходит в
 * /lead-request/accept напрямую — ей предобработка не нужна.
 */
@Injectable()
export class LeadAcceptUseCase
    implements ISalesHookUseCase<ILeadAcceptItem, LeadAcceptBatchResult>
{
    readonly hook = EnumSalesHookCode.LEAD_ACCEPT;
    private readonly logger = new Logger(LeadAcceptUseCase.name);

    constructor(
        private readonly acceptService: LeadRequestAcceptService,
        /** Имена принявших: историю читают люди, а не сверяют id. */
        private readonly userNames: UserNameResolver,
    ) {}

    async execute(
        ctx: SalesHookExecutionContext,
        items: ILeadAcceptItem[],
    ): Promise<LeadAcceptBatchResult> {
        const results: LeadAcceptBatchResult['items'] = [];

        // === Волна 1: сделки элементов без leadId — одним batch'ем.
        const dealsById = await this.prefetch(
            ctx,
            'deal',
            items.flatMap(item =>
                !item.leadId && item.dealId ? [item.dealId] : [],
            ),
        );

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
        const leadsById = await this.prefetch(
            ctx,
            'lead',
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
        for (const [dealId, row] of await this.prefetch(
            ctx,
            'deal',
            baseDealIds,
        )) {
            dealsById.set(dealId, row);
        }

        /*
         * === Имена принявших — одним заходом ДО расчёта и первой записи:
         * resolve шлёт свой batch, а карта команд сейчас пуста (волны выше
         * отправлены, буфер ещё ничего не коммитил). Кандидаты с запасом:
         * явные userId + ответственные всех прочитанных лидов и сделок.
         */
        const names = await this.userNames.resolve(
            ctx.domain,
            ctx.bitrix,
            acceptActorIds(
                items.map(item => item.userId),
                [...leadsById.values(), ...dealsById.values()],
            ),
        );

        // === Расчёт планов — чисто, ноль вызовов.
        const planned: IPlannedAccept[] = [];
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
                    names,
                );
                planned.push({ item, leadId, plan });
            } catch (error) {
                const { message } = getErrorDetails(error);
                this.logger.warn(`lead-accept: лид ${leadId} — ${message}`);
                results.push(this.failure(item, message, leadId));
            }
        }

        /*
         * === Волна 4: открытые задачи и дела принимаемых заявок — одним
         * batch'ем ДО первой записи (ai/rules/bitrix-batch-grouping.md).
         * Принявший забирает работу целиком: задача ХО и задачи роботов не
         * должны остаться на прежних (решение владельца 22.09.2026).
         */
        const writes = planned.filter(
            entry =>
                !entry.plan.already &&
                Object.keys(entry.plan.fields).length > 0,
        );
        const takeover = new WorkTakeoverService(ctx.bitrix);
        const takeoverPlans = await takeover.collect(
            writes.map(entry => entry.plan.takeover),
            'batch',
        );

        // === Запись группами через буфер каркаса.
        let accepted = 0;
        for (const entry of planned) {
            const { item, leadId, plan } = entry;
            const warnings = [...plan.warnings];
            let taken: IWorkTakeoverOutcome = {
                tasksMoved: 0,
                activitiesMoved: 0,
            };
            try {
                const index = writes.indexOf(entry);
                if (index >= 0) {
                    ctx.buffer.queue(() =>
                        ctx.bitrix.batch.lead.update(
                            `la_lead_${leadId}`,
                            leadId,
                            plan.fields as never,
                        ),
                    );
                    for (const update of [plan.dealUpdate, plan.xoDealUpdate]) {
                        if (!update) continue;
                        ctx.buffer.queue(() =>
                            ctx.bitrix.batch.deal.update(
                                `la_deal_${update.dealId}`,
                                update.dealId,
                                update.fields as never,
                            ),
                        );
                    }
                    await ctx.buffer.endGroup();

                    // Перехват — своей группой: команды независимы, а
                    // задач с делами может быть до 60 — в одну не влезут.
                    const found = takeoverPlans[index];
                    if (found && plan.acceptedBy) {
                        warnings.push(...found.warnings);
                        taken = takeover.queue(
                            ctx.buffer,
                            found,
                            plan.acceptedBy,
                            `la_to_${leadId}`,
                        );
                        await ctx.buffer.endGroup();
                    }
                    accepted += 1;
                }
                results.push({
                    leadId,
                    success: true,
                    already: plan.already,
                    firstprepareSeconds: plan.firstprepareSeconds,
                    warnings,
                    ...taken,
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

    /**
     * batch get строк лидов/сделок по списку id — одна волна на любое
     * количество (1 HTTP на 50 команд). Отправляет карту команд инстанса
     * целиком — звать только в фазе чтения, до первой записи.
     */
    private async prefetch(
        ctx: SalesHookExecutionContext,
        entity: 'lead' | 'deal',
        ids: number[],
    ): Promise<Map<number, BxRow>> {
        const unique = [...new Set(ids)];
        const map = new Map<number, BxRow>();
        if (!unique.length) return map;

        for (const id of unique) {
            ctx.bitrix.batch[entity].get(`la_${entity}_get_${id}`, id);
        }
        const key = new RegExp(`^la_${entity}_get_(\\d+)$`);
        const chunks = await ctx.bitrix.api.callBatchWithConcurrency(1);
        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                const match = key.exec(cmd);
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
