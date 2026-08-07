import { Injectable, Logger } from '@nestjs/common';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import { IMergeDuplicatesItem } from '../dto/merge-duplicates.dto';
import { MergeDuplicatesResultDto } from '../dto/merge-duplicates-result.dto';
import { MergePlanService } from '../services/merge-plan.service';
import { MergeExecutorService } from '../services/merge-executor.service';

/**
 * Хук 2.1 «смержить дубли».
 *
 * Двухшаговый протокол безопасности (сущности-жертвы удаляются навсегда):
 *  1. dryRun=true (по умолчанию) — read-only план + planHash;
 *  2. dryRun=false + planHash из шага 1 — выполнение. Несовпадение хэша
 *     (портал изменился с момента просмотра) — отказ, пересчитать план.
 * Однотипные сливаются mergeBatch (survivor первым — guard в executor'е);
 * разнотипные только перепривязываются. Чужие воронки не участвуют.
 */
@Injectable()
export class MergeDuplicatesUseCase
    implements ISalesHookUseCase<IMergeDuplicatesItem, MergeDuplicatesResultDto>
{
    readonly hook = EnumSalesHookCode.MERGE_DUPLICATES;
    private readonly logger = new Logger(MergeDuplicatesUseCase.name);

    async execute(
        ctx: SalesHookExecutionContext,
        items: IMergeDuplicatesItem[],
    ): Promise<MergeDuplicatesResultDto> {
        // Кнопка кладёт ровно один элемент (merge — только frame-путь).
        const item = items[0];
        if (!item) {
            throw new Error('merge: пустая пачка — нечего объединять');
        }

        const planService = new MergePlanService(ctx.bitrix, ctx.portal);
        const plan = await planService.build(item.entityRefs);

        if (item.dryRun) {
            return {
                implemented: true,
                dryRun: true,
                planHash: plan.planHash,
                groups: plan.groups.map(group => ({
                    ...group,
                    status: 'PLANNED',
                    mergedIds: [],
                })),
                relink: plan.relink,
                skipped: plan.skipped,
                warnings: plan.warnings,
                message: `План merge: групп ${plan.groups.length}, перепривязок ${plan.relink.length}, пропущено ${plan.skipped.length}. Для выполнения повторите с dryRun=false и planHash.`,
            };
        }

        if (!item.planHash) {
            throw new Error(
                'merge: выполнение без planHash запрещено — сначала получите план (dryRun=true)',
            );
        }
        if (item.planHash !== plan.planHash) {
            throw new Error(
                'merge: план устарел (портал изменился с момента просмотра) — пересчитайте план и подтвердите заново',
            );
        }
        if (!plan.groups.length && !plan.relink.length) {
            return {
                implemented: true,
                dryRun: false,
                planHash: plan.planHash,
                groups: [],
                relink: [],
                skipped: plan.skipped,
                warnings: plan.warnings,
                message: 'Объединять нечего: все участники отброшены.',
            };
        }

        const executor = new MergeExecutorService(ctx.bitrix);
        const outcome = await executor.execute(plan);

        const success = outcome.groups.filter(
            group => group.status === 'SUCCESS',
        ).length;
        const conflicts = outcome.groups.filter(
            group => group.status === 'CONFLICT',
        ).length;
        this.logger.log(
            `merge выполнен: групп ${outcome.groups.length} (успешно ${success}, конфликтов ${conflicts})`,
        );

        return {
            implemented: true,
            dryRun: false,
            planHash: plan.planHash,
            groups: outcome.groups.map(group => ({
                entityType: group.entityType,
                survivorId: group.survivorId,
                victimIds:
                    plan.groups.find(
                        planned => planned.survivorId === group.survivorId,
                    )?.victimIds ?? [],
                status: group.status,
                mergedIds: group.mergedIds,
                error: group.error ?? null,
            })),
            relink: outcome.relinked,
            skipped: plan.skipped,
            warnings: [...plan.warnings, ...outcome.warnings],
            message: `Merge выполнен: успешных групп ${success} из ${outcome.groups.length}, конфликтов ${conflicts}, перепривязано сделок ${outcome.relinked.length}.`,
        };
    }
}
