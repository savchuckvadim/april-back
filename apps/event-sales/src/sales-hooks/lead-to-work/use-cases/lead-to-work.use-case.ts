import { Injectable, Logger } from '@nestjs/common';
import { getErrorDetails } from '@/shared';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';
import {
    LeadToWorkItemResultDto,
    LeadToWorkResultDto,
} from '../dto/lead-to-work-result.dto';
import { LeadToWorkContextService } from '../services/lead-to-work-context.service';
import { LeadToWorkStageResolver } from '../services/lead-to-work-stage.resolver';
import {
    LeadToWorkFlowService,
    LeadToWorkQueuedPlan,
} from '../services/lead-to-work-flow.service';

type BxRow = Record<string, unknown>;

/**
 * Хук «лид → работа» — не обнуляющее преобразование лида в работу ОП.
 *
 * Один лид = одна группа буфера (company → deal → xo → lead → задачи).
 * После всех групп use-case сам делает flush(), чтобы вернуть клиенту
 * РЕАЛЬНЫЕ id созданных сущностей (финальный flush runner'а станет no-op).
 *
 * Доменная идемпотентность: перед записью читается состояние Битрикса
 * (to_base_sales лида + сделки конвертации) — повтор доводит связи,
 * а не плодит вторые сделки. Ошибка одного лида не валит пачку.
 */
@Injectable()
export class LeadToWorkUseCase
    implements ISalesHookUseCase<ILeadToWorkItem, LeadToWorkResultDto>
{
    readonly hook = EnumSalesHookCode.LEAD_TO_WORK;
    private readonly logger = new Logger(LeadToWorkUseCase.name);

    async execute(
        ctx: SalesHookExecutionContext,
        items: ILeadToWorkItem[],
    ): Promise<LeadToWorkResultDto> {
        const contextService = new LeadToWorkContextService(
            ctx.bitrix,
            ctx.portal,
        );
        const flowService = new LeadToWorkFlowService(ctx.bitrix, ctx.portal);

        const queued: {
            item: ILeadToWorkItem;
            plan?: LeadToWorkQueuedPlan;
            companyId: number | null;
            existingDealId: number | null;
            error?: string;
            warnings: string[];
        }[] = [];

        for (const item of items) {
            try {
                const leadContext = await contextService.load(item.leadId);
                const resolver = new LeadToWorkStageResolver(
                    ctx.portal,
                ).withCurrentLeadStatus(
                    this.text((leadContext.lead as unknown as BxRow).STATUS_ID),
                );
                const stagePlan = resolver.resolve(
                    item,
                    !!leadContext.company,
                    leadContext.isConverted,
                );

                const plan = flowService.queue(
                    item,
                    leadContext,
                    stagePlan,
                    ctx.buffer,
                );
                await ctx.buffer.endGroup();

                queued.push({
                    item,
                    plan,
                    companyId: leadContext.company
                        ? Number(leadContext.company.ID)
                        : null,
                    existingDealId: leadContext.existingOurDeal
                        ? Number(leadContext.existingOurDeal.ID)
                        : null,
                    warnings: [
                        ...leadContext.warnings,
                        ...stagePlan.warnings,
                        ...plan.warnings,
                    ],
                });
            } catch (error) {
                const { message } = getErrorDetails(error);
                this.logger.warn(
                    `lead-to-work: лид ${item.leadId} пропущен — ${message}`,
                );
                queued.push({
                    item,
                    companyId: null,
                    existingDealId: null,
                    error: message,
                    warnings: [],
                });
            }
        }

        // Отправляем всё и разбираем реальные id по cmd-ключам.
        await ctx.buffer.flush();
        const byCmd = this.flattenResults(ctx.buffer.getResults());

        const results = queued.map(entry => this.toItemResult(entry, byCmd));
        const created = results.filter(
            r => r.baseDealId && !r.reused && !r.warnings.includes('__failed'),
        ).length;
        const reused = results.filter(r => r.reused).length;

        return {
            implemented: true,
            items: results,
            leadIds: items.map(item => item.leadId),
            message: `Преобразовано лидов: ${results.length} (создано сделок: ${created}, reuse: ${reused}).`,
        };
    }

    private toItemResult(
        entry: {
            item: ILeadToWorkItem;
            plan?: LeadToWorkQueuedPlan;
            companyId: number | null;
            existingDealId: number | null;
            error?: string;
            warnings: string[];
        },
        byCmd: Map<string, unknown>,
    ): LeadToWorkItemResultDto {
        const { item, plan } = entry;
        const warnings = [...entry.warnings];
        if (entry.error) {
            warnings.push(`Ошибка: ${entry.error}`);
        }

        const idOf = (cmd?: string): number | null => {
            if (!cmd) return null;
            return this.entityIdOf(byCmd.get(cmd));
        };

        return {
            leadId: item.leadId,
            reused: plan?.reused ?? false,
            baseDealId: entry.existingDealId ?? idOf(plan?.dealCmd),
            xoDealId: idOf(plan?.xoCmd),
            companyId: entry.companyId ?? idOf(plan?.companyCmd),
            tasksMoved: plan?.tasksMoved ?? 0,
            tasksClosed: plan?.tasksClosed ?? 0,
            taskCreated: !!plan?.taskAddCmd,
            warnings,
        };
    }

    private flattenResults(
        chunks: { result?: Record<string, unknown> }[],
    ): Map<string, unknown> {
        const byCmd = new Map<string, unknown>();
        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(chunk.result ?? {})) {
                byCmd.set(cmd, value);
            }
        }
        return byCmd;
    }

    /** id из ответа set/add: число, {task:{id}}, строка. */
    private entityIdOf(raw: unknown): number | null {
        if (raw == null) return null;
        if (typeof raw === 'number') return raw;
        if (typeof raw === 'string') {
            const value = Number(raw);
            return Number.isFinite(value) && value > 0 ? value : null;
        }
        if (typeof raw === 'object') {
            const task = (raw as { task?: { id?: unknown } }).task;
            if (task) return this.entityIdOf(task.id);
        }
        return null;
    }

    private text(raw: unknown): string | null {
        if (typeof raw === 'string') return raw.trim() || null;
        if (typeof raw === 'number') return String(raw);
        return null;
    }
}
