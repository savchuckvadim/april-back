import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    crmCardUrl,
    timelineBold,
    timelineLink,
} from '@lib/bitrix/consts/timeline.consts';
import { EventReportContext } from '../context/event-report.context';
import {
    composeStageId,
    getDuplicateCloseStageCode,
} from './deal-target-stage.calculator';
import { addDealComment, dealUserName, positiveId } from './deal-notice.util';

/**
 * Перехват работы у ботов обзвона (`xo_start_bot_user_ids`, gsr 12.11.2026).
 *
 * Забранная сделка бота обновляется обычным потоком отчёта (основная —
 * менеджеру, стадия по плану; ХО-сделка — «успех»). Здесь — остальное:
 *  1. открытые задачи ботов по забранной сделке и дублям — закрыть
 *     (прямое чтение ДО батча, закрытие — в батче ДО сделок: сделка,
 *     ушедшая в финал, сама закрывает свои дела, и наш complete после неё
 *     дал бы «Действие над задачей не разрешено»);
 *  2. лишние основные сделки ботов и их ХО-сделки — в «Не состоялась» /
 *     «без результата»: сделка, оставшаяся в стадии автодозвона, запускала
 *     бы звонки клиенту дальше;
 *  3. после батча — записи в ленту: кто забрал работу, где она теперь.
 *
 * Не @Injectable: инстанс Битрикса домена приходит в конструктор.
 */
export class BotTakeoverFlowService {
    private readonly logger = new Logger(BotTakeoverFlowService.name);
    private botTaskIds: number[] = [];

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /** Открытые задачи ботов по сделкам перехвата — один прямой вызов. */
    async readBotTasks(ctx: EventReportContext): Promise<void> {
        const takeover = ctx.botTakeover;
        if (!takeover) return;
        const links = this.takeoverDeals(ctx).map(deal => `D_${deal.ID}`);
        if (!links.length) return;
        const currentTaskId = positiveId(ctx.currentTask?.id);
        try {
            // Ответственный отбирается здесь, а не фильтром: задач по
            // нескольким сделкам клиента единицы, а список ботов — массив.
            const response = (await this.bitrix.task.getList(
                {
                    UF_CRM_TASK: links,
                    '!=STATUS': EBXTaskStatus.COMPLETED,
                },
                ['ID', 'RESPONSIBLE_ID'],
            )) as {
                result?: {
                    tasks?: {
                        id?: number | string;
                        responsibleId?: number | string;
                    }[];
                };
            };
            const bots = new Set(takeover.botOwnerIds);
            this.botTaskIds = (response?.result?.tasks ?? [])
                .filter(task => bots.has(Number(task.responsibleId)))
                .map(task => positiveId(task.id))
                .filter(
                    (id): id is number => id !== null && id !== currentTaskId,
                );
        } catch (error) {
            this.logger.warn(
                `[${ctx.domain}] задачи ботов не прочитаны — останутся ` +
                    `открытыми: ${(error as Error).message}`,
            );
        }
    }

    /** Закрытие задач ботов и дублей — в общий батч отчёта. */
    queue(ctx: EventReportContext): void {
        const takeover = ctx.botTakeover;
        if (!takeover) return;
        for (const taskId of this.botTaskIds) {
            this.bitrix.batch.task.complete(
                `bot_takeover_task_${taskId}`,
                taskId,
            );
        }
        this.closeDuplicates(takeover.duplicateDeals, 'base');
        this.closeDuplicates(takeover.duplicateXoDeals, 'xo');
        this.logger.log(
            `[${ctx.domain}] перехват у ботов: забрана ` +
                `#${takeover.takenDeal?.ID ?? '—'}, дубли ` +
                `${takeover.duplicateDeals.map(deal => deal.ID).join(', ') || '—'}, ` +
                `задачи ${this.botTaskIds.join(', ') || '—'}`,
        );
    }

    /** Записи в ленту — после батча; ошибки отчёт не роняют. */
    async notify(ctx: EventReportContext): Promise<void> {
        const takeover = ctx.botTakeover;
        const workDealId = positiveId(ctx.currentBaseDeal?.ID);
        if (!takeover || !workDealId) return;
        const takerName = await dealUserName(
            this.bitrix,
            positiveId(ctx.workResponsibleId),
        );
        const workUrl = crmCardUrl(ctx.domain, 'deal', workDealId);

        if (takeover.takenDeal) {
            const botName = await dealUserName(
                this.bitrix,
                positiveId(takeover.takenDeal.ASSIGNED_BY_ID),
            );
            await addDealComment(this.bitrix, this.logger, workDealId, [
                `🤖 ${timelineBold('Работа перешла от бота к менеджеру')}`,
                `Сделка перешла от ${botName} к ${takerName} по отчёту ` +
                    'в «Звонках» после дозвона.',
            ]);
        }
        for (const duplicate of takeover.duplicateDeals) {
            const duplicateId = positiveId(duplicate.ID);
            if (!duplicateId) continue;
            await addDealComment(this.bitrix, this.logger, duplicateId, [
                `🤖 ${timelineBold('Дубль: сделка закрыта')}`,
                `Клиента ведёт ${takerName} в сделке ` +
                    `${timelineLink(workUrl, `#${workDealId}`)}.`,
            ]);
        }
    }

    /** Все сделки перехвата: забранная, дубли и их ХО-сделки. */
    private takeoverDeals(ctx: EventReportContext): IBXDeal[] {
        const takeover = ctx.botTakeover;
        if (!takeover) return [];
        return [
            ...(takeover.takenDeal ? [takeover.takenDeal] : []),
            ...takeover.duplicateDeals,
            ...takeover.duplicateXoDeals,
        ];
    }

    private closeDuplicates(
        deals: readonly IBXDeal[],
        role: 'base' | 'xo',
    ): void {
        if (!deals.length) return;
        const category = this.portal.getDealCategoryByCode(
            role === 'base'
                ? PbxDealCategoryCodeEnum.sales_base
                : PbxDealCategoryCodeEnum.sales_xo,
        );
        const stage = category
            ? getDuplicateCloseStageCode(category, role)
            : null;
        if (!category || !stage) {
            this.logger.warn(
                `перехват у ботов: у воронки ${role} нет стадии закрытия — ` +
                    `дубли ${deals.map(deal => deal.ID).join(', ')} не закрыты`,
            );
            return;
        }
        for (const deal of deals) {
            this.bitrix.batch.deal.update(
                `bot_takeover_close_${deal.ID}`,
                Number(deal.ID),
                { STAGE_ID: composeStageId(category.bitrixId, stage) },
            );
        }
    }
}
