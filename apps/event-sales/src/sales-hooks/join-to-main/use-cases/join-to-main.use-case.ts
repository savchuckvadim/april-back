import { Injectable, Logger } from '@nestjs/common';
import { getErrorDetails } from '@/shared';
import { toTimelineComment } from '@lib/bitrix/consts/timeline.consts';
import { taskCrmBinding } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import {
    EMPTY_WORK_TAKEOVER_PLAN,
    IWorkTakeoverOutcome,
    WorkTakeoverService,
} from '../../../shared/work-takeover';
import { IJoinToMainItem } from '../dto/join-to-main.dto';
import {
    JoinToMainItemResultDto,
    JoinToMainResultDto,
} from '../dto/join-to-main-result.dto';
import { buildJoinPlan, JoinOp } from '../services/join-to-main.plan';
import { JoinToMainReader } from '../services/join-to-main.reader';

/**
 * Хук «присоединить к основной»: сделка-дубль → работа клиента, БЕЗ
 * удаления. Что именно делается — в {@link buildJoinPlan}; здесь фазы:
 *
 *   1. чтение (JoinToMainReader, две batch-волны) + открытые задачи и дела
 *      дубля (WorkTakeoverService) — до первой записи;
 *   2. план — чистая функция;
 *   3. запись: группа связей и обновлений, затем группа перехвата задач
 *      (команды независимы, а вместе они не влезают в 50).
 *
 * Робот шлёт по одной сделке через silence, кнопка — тоже одну; пачка
 * обрабатывается последовательно, ошибка одной сделки не валит остальные.
 */
@Injectable()
export class JoinToMainUseCase
    implements ISalesHookUseCase<IJoinToMainItem, JoinToMainResultDto>
{
    readonly hook = EnumSalesHookCode.JOIN_TO_MAIN;
    private readonly logger = new Logger(JoinToMainUseCase.name);

    async execute(
        ctx: SalesHookExecutionContext,
        items: IJoinToMainItem[],
    ): Promise<JoinToMainResultDto> {
        const results: JoinToMainItemResultDto[] = [];
        for (const item of items) {
            try {
                results.push(await this.joinOne(ctx, item));
            } catch (error) {
                const { message } = getErrorDetails(error);
                this.logger.warn(
                    `join-to-main: сделка ${item.dealId} — ${message}`,
                );
                results.push({
                    ...this.empty(item),
                    skipped: true,
                    warnings: [`Ошибка: ${message}`],
                });
            }
        }
        await ctx.buffer.flush();

        const joined = results.filter(r => !r.skipped).length;
        return {
            implemented: true,
            items: results,
            message: `Присоединено сделок: ${joined} из ${results.length}.`,
        };
    }

    private async joinOne(
        ctx: SalesHookExecutionContext,
        item: IJoinToMainItem,
    ): Promise<JoinToMainItemResultDto> {
        /*
         * Прошлые элементы пачки лежат в карте batch-команд (endGroup кладёт,
         * flush отправляет) — чтение ниже увезло бы их мимо буфера.
         */
        await ctx.buffer.flush();

        const reader = new JoinToMainReader(ctx.bitrix, ctx.portal);
        const snapshot = await reader.read(item);

        const takeover = new WorkTakeoverService(ctx.bitrix);
        const [work = EMPTY_WORK_TAKEOVER_PLAN] = snapshot.source
            ? await takeover.collect(
                  [
                      {
                          leadIds: snapshot.source.leadIds,
                          dealIds: [snapshot.source.id],
                      },
                  ],
                  'batch',
              )
            : [];

        const plan = buildJoinPlan(ctx.portal, ctx.domain, snapshot);
        if (plan.skipped) {
            return {
                ...this.empty(item),
                mainDealId: plan.mainDealId,
                companyId: plan.companyId,
                skipped: true,
                warnings: plan.warnings,
            };
        }

        for (const op of plan.ops) this.queueOp(ctx, op);
        await ctx.buffer.endGroup();

        let taken: IWorkTakeoverOutcome = { tasksMoved: 0, activitiesMoved: 0 };
        if (plan.mainDealId && plan.responsibleId) {
            taken = takeover.queue(
                ctx.buffer,
                work,
                plan.responsibleId,
                `jm_to_${item.dealId}`,
                { addTaskBindings: [taskCrmBinding('DEAL', plan.mainDealId)] },
            );
            await ctx.buffer.endGroup();
        }

        this.logger.log(
            `join-to-main: ${item.dealId} → ${plan.mainDealId ?? 'основной нет'}: ` +
                `контактов ${plan.contactsLinked}, лидов ${plan.leadsRelinked}, ` +
                `задач ${taken.tasksMoved}, дел ${taken.activitiesMoved}, ` +
                `дубль закрыт: ${plan.closesAsDuplicate ? 'да' : 'нет'}`,
        );
        return {
            dealId: item.dealId,
            mainDealId: plan.mainDealId,
            companyId: plan.companyId,
            contactsLinked: plan.contactsLinked,
            leadsRelinked: plan.leadsRelinked,
            tasksMoved: taken.tasksMoved,
            activitiesMoved: taken.activitiesMoved,
            closedAsDuplicate: plan.closesAsDuplicate,
            skipped: false,
            warnings: [...plan.warnings, ...work.warnings],
        };
    }

    /** Запись плана → batch-команда в текущую группу буфера. */
    private queueOp(ctx: SalesHookExecutionContext, op: JoinOp): void {
        switch (op.kind) {
            case 'contactCompany':
                ctx.buffer.queue(() =>
                    ctx.bitrix.api.addCmdBatch(
                        `jm_ctco_${op.contactId}_${op.companyId}`,
                        'crm.contact.company.add',
                        {
                            id: op.contactId,
                            fields: { COMPANY_ID: op.companyId },
                        },
                    ),
                );
                return;
            case 'dealContact':
                ctx.buffer.queue(() =>
                    ctx.bitrix.api.addCmdBatch(
                        `jm_dct_${op.dealId}_${op.contactId}`,
                        'crm.deal.contact.add',
                        { id: op.dealId, fields: { CONTACT_ID: op.contactId } },
                    ),
                );
                return;
            case 'dealUpdate':
                ctx.buffer.queue(() =>
                    ctx.bitrix.batch.deal.update(
                        `jm_deal_${op.dealId}`,
                        op.dealId,
                        op.fields as never,
                    ),
                );
                return;
            case 'leadUpdate':
                ctx.buffer.queue(() =>
                    ctx.bitrix.batch.lead.update(
                        `jm_lead_${op.leadId}`,
                        op.leadId,
                        op.fields as never,
                    ),
                );
                return;
            case 'timeline':
                ctx.buffer.queue(() =>
                    ctx.bitrix.batch.timeline.addTimelineComment(
                        `jm_tl_${op.dealId}`,
                        {
                            ENTITY_TYPE: 'deal',
                            ENTITY_ID: op.dealId,
                            // Экранирование под batch — на границе транспорта.
                            COMMENT: toTimelineComment([op.comment]),
                        },
                    ),
                );
                return;
        }
    }

    private empty(item: IJoinToMainItem): JoinToMainItemResultDto {
        return {
            dealId: item.dealId,
            mainDealId: null,
            companyId: null,
            contactsLinked: 0,
            leadsRelinked: 0,
            tasksMoved: 0,
            activitiesMoved: 0,
            closedAsDuplicate: false,
            skipped: false,
            warnings: [],
        };
    }
}
