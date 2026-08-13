import { Injectable, Logger } from '@nestjs/common';
import { BATCH_LINE_BREAK_SYMBOL } from '@lib/bitrix/consts/batch.consts';
import { getErrorDetails } from '@/shared';
import {
    mergeTaskCrmBindings,
    taskCrmBinding,
} from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { ITransferWorkItem } from '../dto/transfer-work.dto';
import { TransferWorkResultDto } from '../dto/transfer-work-result.dto';
import { SalesScopeService, ScopedDeal } from '../services/sales-scope.service';
import {
    appendDealHistory,
    stampDealAssignedAt,
} from '../../../shared/lead-request/deal-work-timer.util';
import { LEAD_REQUEST_HISTORY_TEXT } from '../../../shared/lead-request/lead-request-history.util';

type BxRow = Record<string, unknown>;

/** Префикс задач при передаче (идемпотентный). */
const CALL_TASK_PREFIX = 'Звонок';

/** Категории-«аналитические спутники»: при передаче закрываются в fail. */
const SATELLITE_CATEGORIES = new Set<PbxDealCategoryCodeEnum>([
    PbxDealCategoryCodeEnum.sales_presentation,
    PbxDealCategoryCodeEnum.sales_xo,
]);

/**
 * Хук 2.2 «передать работу»: компания и/или сделки + задачи переезжают к
 * новому ответственному.
 *
 * Правила (решения ТЗ): sales_base — передаём (стадию не трогаем, опция
 * moveMainDealToCold); презентации/ХО — ЗАКРЫВАЕМ в fail-стадию своей
 * категории; tmc/service — только смена ответственного; чужие воронки не
 * трогаем; KPI/списки не трогаем; задачи получают префикс «Звонок»,
 * GROUP_ID группы ОП и нового ответственного; дедлайны как есть.
 * Повторяемость бесконечная: каждый шаг — установка в целевое значение.
 * Graceful: нерезолвящаяся fail-стадия → warning, сделка не закрывается.
 */
@Injectable()
export class TransferWorkUseCase
    implements ISalesHookUseCase<ITransferWorkItem, TransferWorkResultDto>
{
    readonly hook = EnumSalesHookCode.TRANSFER_WORK;
    private readonly logger = new Logger(TransferWorkUseCase.name);

    async execute(
        ctx: SalesHookExecutionContext,
        items: ITransferWorkItem[],
    ): Promise<TransferWorkResultDto> {
        const entityKeys: string[] = [];
        const warnings: string[] = [];

        for (const item of items) {
            try {
                warnings.push(...(await this.transferOne(ctx, item)));
                entityKeys.push(
                    item.companyId
                        ? `company:${item.companyId}`
                        : `deals:${(item.dealIds ?? []).join('+')}`,
                );
            } catch (error) {
                const { message } = getErrorDetails(error);
                warnings.push(`Ошибка передачи: ${message}`);
            }
        }
        await ctx.buffer.flush();

        return {
            implemented: true,
            entityKeys,
            message: `Передача выполнена (${entityKeys.length}); предупреждений: ${warnings.length}.`,
            warnings,
        };
    }

    private async transferOne(
        ctx: SalesHookExecutionContext,
        item: ITransferWorkItem,
    ): Promise<string[]> {
        const scopeService = new SalesScopeService(ctx.bitrix, ctx.portal);
        const scope = await scopeService.collect({
            companyId: item.companyId,
            dealIds: item.dealIds,
        });
        const warnings = [...scope.warnings, ...scope.foreign];
        const newResponsible = String(item.newResponsibleId);
        const groupId = ctx.portal.getSalesTaskGroupId();

        const closedSatellites: string[] = [];
        let mainDealId: number | null = null;

        for (const scoped of scope.deals) {
            const dealId = Number(scoped.deal.ID);
            if (scoped.categoryCode === PbxDealCategoryCodeEnum.sales_base) {
                mainDealId = mainDealId ?? dealId;
                const fields: BxRow = { ASSIGNED_BY_ID: newResponsible };
                if (item.moveMainDealToCold) {
                    const stageId = this.stageId(ctx, scoped, 'sales_cold');
                    if (stageId) fields.STAGE_ID = stageId;
                    else
                        warnings.push(
                            `Стадия sales_cold не сопоставлена — основная сделка ${dealId} осталась в своей стадии`,
                        );
                }
                this.startWaitingForAccept(ctx, scoped, fields, item);
                ctx.buffer.queue(() =>
                    ctx.bitrix.batch.deal.update(
                        `tw_base_${dealId}`,
                        dealId,
                        fields as never,
                    ),
                );
                continue;
            }

            if (
                scoped.categoryCode &&
                SATELLITE_CATEGORIES.has(scoped.categoryCode)
            ) {
                // «Проще закрыть аналитические сделки» — решение клиента.
                const failStage = this.failStageId(ctx, scoped);
                if (!failStage) {
                    warnings.push(
                        `Fail-стадия воронки ${scoped.categoryCode} не сопоставлена — сделка ${dealId} не закрыта`,
                    );
                    continue;
                }
                ctx.buffer.queue(() =>
                    ctx.bitrix.batch.deal.update(`tw_sat_${dealId}`, dealId, {
                        STAGE_ID: failStage,
                    } as never),
                );
                closedSatellites.push(
                    `${scoped.categoryCode} #${dealId} «${this.textOf((scoped.deal as unknown as BxRow).TITLE)}»`,
                );
                continue;
            }

            // tmc/service и прочие наши: только новый ответственный.
            const otherFields: BxRow = { ASSIGNED_BY_ID: newResponsible };
            this.startWaitingForAccept(ctx, scoped, otherFields, item);
            ctx.buffer.queue(() =>
                ctx.bitrix.batch.deal.update(
                    `tw_other_${dealId}`,
                    dealId,
                    otherFields as never,
                ),
            );
        }

        // Компания — новому ответственному.
        if (item.companyId) {
            const companyId = item.companyId;
            ctx.buffer.queue(() =>
                ctx.bitrix.batch.company.update(
                    `tw_company_${companyId}`,
                    companyId,
                    {
                        ASSIGNED_BY_ID: newResponsible,
                    } as never,
                ),
            );
        }

        // Задачи: целевые значения, идемпотентный префикс, заметка о закрытом.
        // Перенос строки через BATCH_LINE_BREAK_SYMBOL: задача обновляется
        // batch-командой, обычный `\n` там съедается и текст склеивается.
        const closedNote = closedSatellites.length
            ? `${BATCH_LINE_BREAK_SYMBOL}[Передача работы] Закрыты аналитические сделки: ${closedSatellites.join('; ')}`
            : '';
        let movedTasks = 0;
        for (const task of scope.openTasks) {
            const row = task as unknown as BxRow;
            const taskId = Number(row.id ?? row.ID);
            if (!Number.isFinite(taskId)) continue;
            const deadline = this.textOf(row.deadline ?? row.DEADLINE);
            if (
                !item.includeOverdue &&
                deadline &&
                Date.parse(deadline) < Date.now()
            ) {
                warnings.push(
                    `Задача ${taskId} просрочена и пропущена (includeOverdue=false)`,
                );
                continue;
            }
            const title = this.textOf(row.title ?? row.TITLE);
            const bindings = this.refListOf(row.ufCrmTask ?? row.UF_CRM_TASK);
            const payload: BxRow = {
                TITLE: title.startsWith(CALL_TASK_PREFIX)
                    ? title
                    : `${CALL_TASK_PREFIX} ${title}`.trim(),
                RESPONSIBLE_ID: item.newResponsibleId,
                UF_CRM_TASK: mergeTaskCrmBindings(
                    bindings,
                    mainDealId ? [taskCrmBinding('DEAL', mainDealId)] : [],
                ),
                ...(groupId ? { GROUP_ID: groupId } : {}),
            };
            if (closedNote) {
                payload.DESCRIPTION = `${this.textOf(row.description ?? row.DESCRIPTION)}${closedNote}`;
            }
            ctx.buffer.queue(() =>
                ctx.bitrix.batch.task.update(
                    `tw_task_${taskId}`,
                    taskId,
                    payload as never,
                ),
            );
            movedTasks += 1;
        }

        // Новому ответственному — задача «Звонок», если попросили.
        if (item.createCallTask && (mainDealId || item.companyId)) {
            const bindings: string[] = [];
            if (item.companyId)
                bindings.push(taskCrmBinding('COMPANY', item.companyId));
            if (mainDealId) bindings.push(taskCrmBinding('DEAL', mainDealId));
            ctx.buffer.queue(() =>
                ctx.bitrix.batch.task.add(
                    `tw_task_add_${item.companyId ?? mainDealId}`,
                    {
                        TITLE: `${CALL_TASK_PREFIX} по переданной работе`,
                        RESPONSIBLE_ID: item.newResponsibleId,
                        UF_CRM_TASK: bindings,
                        ...(groupId ? { GROUP_ID: groupId } : {}),
                    } as never,
                ),
            );
        }

        await ctx.buffer.endGroup();
        this.logger.log(
            `transfer-work: сделок ${scope.deals.length}, задач ${movedTasks}, сателлитов закрыто ${closedSatellites.length}`,
        );
        return warnings;
    }

    /**
     * СТАРТ ожидания подтверждения по сделке: пишем `op_lead_assigned_at` и
     * зеркальную запись в историю сделки.
     *
     * Это единственная точка, где таймер сделки СТАВИТСЯ: передача работы и
     * есть тот момент, когда сделка меняет хозяина и новый обязан её
     * подтвердить. Снимает таймер только принятие
     * (`LeadRequestAcceptService`), а страхует SLA-крон.
     *
     * Закрываемые сателлиты (презентации/ХО) сюда не попадают: подтверждать
     * закрытую в fail сделку не нужно.
     */
    private startWaitingForAccept(
        ctx: SalesHookExecutionContext,
        scoped: ScopedDeal,
        fields: BxRow,
        item: ITransferWorkItem,
    ): void {
        if (
            !stampDealAssignedAt(ctx.portal, fields, ctx.portal.getTimezone())
        ) {
            return;
        }
        const previous = this.textOf(
            (scoped.deal as unknown as BxRow).ASSIGNED_BY_ID,
        );
        const text =
            previous && previous !== String(item.newResponsibleId)
                ? LEAD_REQUEST_HISTORY_TEXT.transferred(
                      Number(previous),
                      item.newResponsibleId,
                  )
                : LEAD_REQUEST_HISTORY_TEXT.assigned(item.newResponsibleId);
        appendDealHistory(
            ctx.portal,
            fields,
            scoped.deal as unknown as BxRow,
            text,
        );
    }

    private stageId(
        ctx: SalesHookExecutionContext,
        scoped: ScopedDeal,
        stageCode: string,
    ): string | null {
        if (!scoped.categoryCode) return null;
        const category = ctx.portal.getDealCategoryByCode(scoped.categoryCode);
        const stage = category?.stages.find(st => st.code === stageCode);
        return category && stage
            ? `C${category.bitrixId}:${stage.bitrixId}`
            : null;
    }

    /** Fail-стадия своей категории: `{prefix}_fail` (graceful: null). */
    private failStageId(
        ctx: SalesHookExecutionContext,
        scoped: ScopedDeal,
    ): string | null {
        if (!scoped.categoryCode) return null;
        const category = ctx.portal.getDealCategoryByCode(scoped.categoryCode);
        if (!category) return null;
        const stage = category.stages.find(st => st.code.endsWith('_fail'));
        return stage ? `C${category.bitrixId}:${stage.bitrixId}` : null;
    }

    private refListOf(raw: unknown): string[] {
        if (raw == null || raw === false) return [];
        const items = Array.isArray(raw) ? raw : [raw];
        return items
            .map(value =>
                typeof value === 'string' || typeof value === 'number'
                    ? String(value).trim()
                    : '',
            )
            .filter(Boolean);
    }

    private textOf(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return '';
    }
}
