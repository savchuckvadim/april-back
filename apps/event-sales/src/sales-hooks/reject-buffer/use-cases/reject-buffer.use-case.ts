import { Injectable, Logger } from '@nestjs/common';
import { BATCH_LINE_BREAK_SYMBOL } from '@lib/bitrix/consts/batch.consts';
import { getErrorDetails } from '@/shared';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import { IRejectBufferItem } from '../dto/reject-buffer.dto';
import { RejectBufferResultDto } from '../dto/reject-buffer-result.dto';
import {
    SalesScopeService,
    ScopedDeal,
} from '../../transfer-work/services/sales-scope.service';

type BxRow = Record<string, unknown>;

/**
 * Хук 2.3 «в буфер отказников»: основная сделка (sales_base) → «Отказ»
 * (sales_fail), остальные наши сделки скоупа → fail-стадия своей категории
 * («не состоялось»). Чужие воронки не трогаем; KPI/списки не трогаем.
 * Задачи: complete (с причиной в описании) или keep — по флагу.
 * Graceful: нерезолвящаяся fail-стадия → warning, сделка остаётся.
 */
@Injectable()
export class RejectBufferUseCase
    implements ISalesHookUseCase<IRejectBufferItem, RejectBufferResultDto>
{
    readonly hook = EnumSalesHookCode.REJECT_BUFFER;
    private readonly logger = new Logger(RejectBufferUseCase.name);

    async execute(
        ctx: SalesHookExecutionContext,
        items: IRejectBufferItem[],
    ): Promise<RejectBufferResultDto> {
        const entityKeys: string[] = [];
        const warnings: string[] = [];

        for (const item of items) {
            try {
                warnings.push(...(await this.rejectOne(ctx, item)));
                entityKeys.push(
                    item.companyId
                        ? `company:${item.companyId}`
                        : `deals:${(item.dealIds ?? []).join('+')}`,
                );
            } catch (error) {
                warnings.push(
                    `Ошибка отказа: ${getErrorDetails(error).message}`,
                );
            }
        }
        await ctx.buffer.flush();

        return {
            implemented: true,
            entityKeys,
            message: `Буфер отказников: обработано ${entityKeys.length}; предупреждений: ${warnings.length}.`,
            warnings,
        };
    }

    private async rejectOne(
        ctx: SalesHookExecutionContext,
        item: IRejectBufferItem,
    ): Promise<string[]> {
        const scopeService = new SalesScopeService(ctx.bitrix, ctx.portal);
        const scope = await scopeService.collect({
            companyId: item.companyId,
            dealIds: item.dealIds,
        });
        const warnings = [...scope.warnings, ...scope.foreign];

        for (const scoped of scope.deals) {
            const dealId = Number(scoped.deal.ID);
            const failStage = this.failStageId(ctx, scoped);
            if (!failStage) {
                warnings.push(
                    `Fail-стадия воронки ${scoped.categoryCode} не сопоставлена — сделка ${dealId} не переведена`,
                );
                continue;
            }
            ctx.buffer.queue(() =>
                ctx.bitrix.batch.deal.update(`rb_deal_${dealId}`, dealId, {
                    STAGE_ID: failStage,
                } as never),
            );
        }

        if (item.taskMode === 'complete') {
            // Перенос строки — batch-символ: задачи закрываются batch'ем.
            const note = item.reasonCode
                ? `${BATCH_LINE_BREAK_SYMBOL}[Буфер отказников] Причина: ${item.reasonCode}`
                : `${BATCH_LINE_BREAK_SYMBOL}[Буфер отказников] Работа переведена в отказ`;
            for (const task of scope.openTasks) {
                const row = task as unknown as BxRow;
                const taskId = Number(row.id ?? row.ID);
                if (!Number.isFinite(taskId)) continue;
                ctx.buffer.queue(() =>
                    ctx.bitrix.batch.task.update(
                        `rb_task_note_${taskId}`,
                        taskId,
                        {
                            DESCRIPTION: `${this.textOf(row.description ?? row.DESCRIPTION)}${note}`,
                        } as never,
                    ),
                );
                ctx.buffer.queue(() =>
                    ctx.bitrix.batch.task.complete(
                        `rb_task_close_${taskId}`,
                        taskId,
                    ),
                );
            }
        }

        await ctx.buffer.endGroup();
        this.logger.log(
            `reject-buffer: сделок ${scope.deals.length}, задач закрыто ${
                item.taskMode === 'complete' ? scope.openTasks.length : 0
            }`,
        );
        return warnings;
    }

    /** sales_base → sales_fail; прочие наши → `{prefix}_fail` своей категории. */
    private failStageId(
        ctx: SalesHookExecutionContext,
        scoped: ScopedDeal,
    ): string | null {
        if (!scoped.categoryCode) return null;
        const category = ctx.portal.getDealCategoryByCode(scoped.categoryCode);
        if (!category) return null;
        const stage =
            category.stages.find(st => st.code === 'sales_fail') ??
            category.stages.find(st => st.code.endsWith('_fail'));
        return stage ? `C${category.bitrixId}:${stage.bitrixId}` : null;
    }

    private textOf(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return '';
    }
}
