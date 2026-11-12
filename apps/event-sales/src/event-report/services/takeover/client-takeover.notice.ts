import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task';
import {
    crmCardUrl,
    timelineBold,
    timelineLink,
} from '@lib/bitrix/consts/timeline.consts';
import { findBatchResult } from '../../../shared/bitrix/prepare-batch-results.util';
import { EventReportContext } from '../context/event-report.context';
import {
    addDealComment,
    dealUserName,
    positiveId,
    pushLink,
} from '../deal/deal-notice.util';
import { SET_BASE_DEAL_CMD } from '../deal/sales-base-deal.service';
import { ClientTakeover } from './client-takeover';
import { TakeoverCleanupPlan } from './takeover-cleanup.plan';

/** Тег уведомления: повтор по той же паре схлопывается. */
const NOTIFY_TAG_PREFIX = 'event-report-client-takeover';

export interface ClientTakeoverNoticeInput {
    plan: TakeoverCleanupPlan;
    /** Задачи клиента из сборщика — чтобы знать ответственных. */
    tasks: readonly IBXTask[];
    notifyPrevious: boolean;
    batchResults: readonly IBitrixBatchResponseResult[];
}

/** Что досталось/закрылось у одного прежнего владельца. */
interface OwnerLoss {
    takenDealId: number | null;
    closedDealIds: number[];
    movedTasks: number;
    closedTasks: number;
}

const taskOwner = (task: IBXTask): number => {
    const row = task as unknown as Record<string, unknown>;
    return positiveId(row['responsibleId'] ?? row['RESPONSIBLE_ID']) ?? 0;
};
const taskId = (task: IBXTask): number => {
    const row = task as unknown as Record<string, unknown>;
    return positiveId(row['id'] ?? row['ID']) ?? 0;
};

/**
 * Записи о перехвате клиента: в ленте рабочей сделки — что перешло и что
 * закрыто, в ленте каждой закрытой основной — «Дубль: клиента ведёт…»; по
 * настройке — уведомление каждому прежнему ответственному (кроме ботов).
 * После батча: id новой сделки известен только из его ответа. Ошибки
 * отчёт не роняют.
 */
export class ClientTakeoverNotice {
    private readonly logger = new Logger(ClientTakeoverNotice.name);

    constructor(private readonly bitrix: BitrixService) {}

    async notify(
        ctx: EventReportContext,
        input: ClientTakeoverNoticeInput,
    ): Promise<void> {
        const takeover = ctx.takeover;
        const workDealId =
            positiveId(ctx.currentBaseDeal?.ID) ??
            positiveId(
                findBatchResult<unknown>(
                    [...input.batchResults],
                    SET_BASE_DEAL_CMD,
                ),
            );
        if (!takeover || !workDealId) return;

        const takerName = await dealUserName(this.bitrix, takeover.reporterId);
        const workUrl = crmCardUrl(ctx.domain, 'deal', workDealId);
        await this.workDealComment(
            ctx,
            takeover,
            input.plan,
            workDealId,
            takerName,
        );

        for (const { deal, role } of input.plan.closeDeals) {
            const dealId = positiveId(deal.ID);
            if (role !== 'base' || !dealId) continue;
            await addDealComment(this.bitrix, this.logger, dealId, [
                `🤝 ${timelineBold('Дубль: сделка закрыта')}`,
                `Клиента ведёт ${takerName} в сделке ` +
                    `${timelineLink(workUrl, `#${workDealId}`)}.`,
            ]);
        }

        if (input.notifyPrevious) {
            await this.notifyOwners(
                ctx,
                takeover,
                input,
                workDealId,
                takerName,
            );
        }
    }

    private async workDealComment(
        ctx: EventReportContext,
        takeover: ClientTakeover,
        plan: TakeoverCleanupPlan,
        workDealId: number,
        takerName: string,
    ): Promise<void> {
        const lines = [
            `🤝 ${timelineBold(`Работа по клиенту перешла к ${takerName}`)}`,
        ];
        const taken = takeover.takenDeal;
        if (taken) {
            const from = await dealUserName(
                this.bitrix,
                positiveId(taken.ASSIGNED_BY_ID),
            );
            lines.push(
                `Сделка перешла от ${from} по отчёту в «Звонках»` +
                    (plan.reassignTaskIds.length
                        ? `, вместе с задачами: ${plan.reassignTaskIds.length}.`
                        : '.'),
            );
        }
        const closed = [
            `сделок — ${plan.closeDeals.length}`,
            `задач — ${plan.completeTaskIds.length}`,
            `презентаций — ${plan.closePresIds.length}`,
            `ЗПР — ${plan.closeZprIds.length}`,
        ];
        if (
            plan.closeDeals.length ||
            plan.completeTaskIds.length ||
            plan.closePresIds.length ||
            plan.closeZprIds.length
        ) {
            lines.push(`Закрыта прежняя работа: ${closed.join(', ')}.`);
        }
        if (takeover.protectedDeals.length) {
            const kept = takeover.protectedDeals
                .map(deal => positiveId(deal.ID))
                .filter((id): id is number => id !== null)
                .map(id =>
                    timelineLink(crmCardUrl(ctx.domain, 'deal', id), `#${id}`),
                );
            lines.push(
                `Не тронуты сделки на поздних стадиях: ${kept.join(', ')} — ` +
                    'договоритесь с их ответственными.',
            );
        }
        await addDealComment(this.bitrix, this.logger, workDealId, lines);
    }

    private async notifyOwners(
        ctx: EventReportContext,
        takeover: ClientTakeover,
        input: ClientTakeoverNoticeInput,
        workDealId: number,
        takerName: string,
    ): Promise<void> {
        const losses = new Map<number, OwnerLoss>();
        const lossOf = (ownerId: number): OwnerLoss => {
            const known = losses.get(ownerId);
            if (known) return known;
            const fresh: OwnerLoss = {
                takenDealId: null,
                closedDealIds: [],
                movedTasks: 0,
                closedTasks: 0,
            };
            losses.set(ownerId, fresh);
            return fresh;
        };
        const takenOwner = positiveId(takeover.takenDeal?.ASSIGNED_BY_ID);
        if (takenOwner)
            lossOf(takenOwner).takenDealId = positiveId(takeover.takenDeal?.ID);
        for (const { deal } of input.plan.closeDeals) {
            const owner = positiveId(deal.ASSIGNED_BY_ID);
            const dealId = positiveId(deal.ID);
            if (owner && dealId) lossOf(owner).closedDealIds.push(dealId);
        }
        const moved = new Set(input.plan.reassignTaskIds);
        const completed = new Set(input.plan.completeTaskIds);
        for (const task of input.tasks) {
            const owner = taskOwner(task);
            if (!owner) continue;
            if (moved.has(taskId(task))) lossOf(owner).movedTasks += 1;
            if (completed.has(taskId(task))) lossOf(owner).closedTasks += 1;
        }

        const workUrl = crmCardUrl(ctx.domain, 'deal', workDealId);
        const client =
            String(ctx.company?.TITLE ?? '').trim() || `сделке #${workDealId}`;
        for (const [ownerId, loss] of losses) {
            if (ownerId === takeover.reporterId) continue;
            if (takeover.botOwnerIds.includes(ownerId)) continue;
            const parts: string[] = [];
            if (loss.takenDealId) {
                parts.push(
                    `сделка ${pushLink(crmCardUrl(ctx.domain, 'deal', loss.takenDealId), `#${loss.takenDealId}`)} передана`,
                );
            }
            if (loss.closedDealIds.length) {
                parts.push(
                    `закрыты сделки ${loss.closedDealIds
                        .map(id =>
                            pushLink(
                                crmCardUrl(ctx.domain, 'deal', id),
                                `#${id}`,
                            ),
                        )
                        .join(', ')}`,
                );
            }
            if (loss.movedTasks)
                parts.push(`передано задач: ${loss.movedTasks}`);
            if (loss.closedTasks)
                parts.push(`закрыто задач: ${loss.closedTasks}`);
            if (!parts.length) continue;
            try {
                await this.bitrix.imNotify.systemAdd({
                    USER_ID: ownerId,
                    MESSAGE:
                        `Клиент «${client}» перешёл к ${takerName} ` +
                        `(${pushLink(workUrl, `#${workDealId}`)}): ${parts.join(', ')}.`,
                    TAG: `${NOTIFY_TAG_PREFIX}-${workDealId}-${ownerId}`,
                });
            } catch (error) {
                this.logger.warn(
                    `[${ctx.domain}] уведомление о перехвате сотруднику #${ownerId} ` +
                        `не отправлено: ${(error as Error).message}`,
                );
            }
        }
    }
}
