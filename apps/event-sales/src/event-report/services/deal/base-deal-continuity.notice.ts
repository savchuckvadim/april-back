import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { BitrixEntityType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import {
    crmCardUrl,
    timelineBold,
    timelineLink,
    toTimelineComment,
} from '@lib/bitrix/consts/timeline.consts';
import { findBatchResult } from '../../../shared/bitrix/prepare-batch-results.util';
import { EventReportContext } from '../context/event-report.context';
import { DealFlowResult } from './event-report-deal-flow.service';
import { SET_BASE_DEAL_CMD } from './sales-base-deal.service';
import {
    addDealComment,
    dealUserName,
    positiveId,
    pushLink,
} from './deal-notice.util';

/** Тег уведомления: повтор по той же паре сделок схлопывается в один. */
const NOTIFY_TAG_PREFIX = 'event-report-base-continuity';

/**
 * Что сказать менеджеру, когда сделка запуска «ОП Основная» была закрыта
 * (см. closed-launch-base-deal): вернули её в работу — запись в её ленте;
 * работа ушла в другую сделку — запись в ленте обеих и уведомление, чтобы
 * в двух сделках клиента не путались (владелец, 06.10.2026).
 *
 * Не @Injectable: инстанс Битрикса домена приходит в конструктор.
 */
export class BaseDealContinuityNotice {
    private readonly logger = new Logger(BaseDealContinuityNotice.name);

    constructor(private readonly bitrix: BitrixService) {}

    /**
     * Сделку вернули в работу — строка в её ленте, в ТОМ ЖЕ батче, что и
     * смена стадии. Чужая сделка переходит к новому ответственному
     * (владелец, 30.10.2026) — это тоже пишем.
     */
    async queueReopenNote(ctx: EventReportContext): Promise<void> {
        const dealId = positiveId(ctx.currentBaseDeal?.ID);
        if (!ctx.reopenedBaseDeal || !dealId) return;
        const handover = this.reopenHandover(ctx);
        const lines = [
            `↩️ ${timelineBold('Сделка возвращена в работу')}`,
            'Была закрыта как отказ. По клиенту запланировано новое ' +
                'событие, а других открытых сделок «ОП Основная» нет — ' +
                'работа продолжается здесь.',
        ];
        if (handover) {
            const [from, to] = await Promise.all([
                dealUserName(this.bitrix, handover.fromId),
                dealUserName(this.bitrix, handover.toId),
            ]);
            lines.push(`Ответственный сменён: ${from} → ${to}.`);
        }
        this.bitrix.batch.timeline.addTimelineComment(
            `reopen_base_deal_${dealId}`,
            {
                ENTITY_TYPE: BitrixEntityType.DEAL,
                ENTITY_ID: dealId,
                COMMENT: toTimelineComment(lines),
            },
        );
    }

    /**
     * Чужую закрытую сделку вернули в работу на другого сотрудника —
     * прежний ответственный узнаёт об этом. После основного батча.
     */
    async notifyReopenHandover(ctx: EventReportContext): Promise<void> {
        const dealId = positiveId(ctx.currentBaseDeal?.ID);
        if (!ctx.reopenedBaseDeal || !dealId) return;
        const handover = this.reopenHandover(ctx);
        if (!handover) return;
        const toName = await dealUserName(this.bitrix, handover.toId);
        const url = crmCardUrl(ctx.domain, 'deal', dealId);
        try {
            await this.bitrix.imNotify.systemAdd({
                USER_ID: handover.fromId,
                MESSAGE:
                    `Ваша закрытая сделка ${pushLink(url, `#${dealId}`)} ` +
                    `возвращена в работу: по клиенту отчитался ${toName}, ` +
                    'теперь сделка у него.',
                TAG: `${NOTIFY_TAG_PREFIX}-reopen-${dealId}-${handover.toId}`,
            });
        } catch (error) {
            this.logger.warn(
                `[${ctx.domain}] уведомление о возврате #${dealId} ` +
                    `не отправлено: ${(error as Error).message}`,
            );
        }
    }

    /** Прежний и новый ответственный возвращённой сделки; совпали — null. */
    private reopenHandover(
        ctx: EventReportContext,
    ): { fromId: number; toId: number } | null {
        const fromId = positiveId(ctx.currentBaseDeal?.ASSIGNED_BY_ID);
        const toId = positiveId(ctx.workResponsibleId);
        return fromId && toId && fromId !== toId ? { fromId, toId } : null;
    }

    /**
     * Сделка запуска осталась закрытой, а работа ушла в другую — записи в
     * ленту обеих и уведомление ответственному. После основного батча:
     * id новой сделки известен только из его ответа. Ошибки не роняют отчёт.
     */
    async notifyContinuation(
        ctx: EventReportContext,
        deals: DealFlowResult,
        batchResults: IBitrixBatchResponseResult[],
    ): Promise<void> {
        const closedId = positiveId(ctx.closedLaunchBaseDeal?.ID);
        if (!closedId) return;
        const isNew = deals.baseDealId?.startsWith('$result') ?? false;
        const targetId = isNew
            ? positiveId(
                  findBatchResult<unknown>(batchResults, SET_BASE_DEAL_CMD),
              )
            : positiveId(deals.baseDealId);
        if (!targetId || targetId === closedId) return;

        const closedUrl = crmCardUrl(ctx.domain, 'deal', closedId);
        const targetUrl = crmCardUrl(ctx.domain, 'deal', targetId);
        const targetLabel = `#${targetId}${isNew ? ' (новая)' : ''}`;

        await this.comment(closedId, [
            `➡️ ${timelineBold('Работа по клиенту продолжена в другой сделке')}`,
            `Сделка: ${timelineLink(targetUrl, targetLabel)}. Эта осталась ` +
                'закрытой — работайте в новой.',
        ]);
        await this.comment(targetId, [
            `➡️ ${timelineBold(isNew ? 'Создана вместо закрытой сделки' : 'Сюда продолжена работа из закрытой сделки')}`,
            `Закрытая сделка: ${timelineLink(closedUrl, `#${closedId}`)}.`,
        ]);

        const userId = positiveId(ctx.workResponsibleId);
        if (!userId) return;
        try {
            await this.bitrix.imNotify.systemAdd({
                USER_ID: userId,
                MESSAGE:
                    `Работа по клиенту продолжена в сделке ` +
                    `${pushLink(targetUrl, targetLabel)}: сделка ` +
                    `${pushLink(closedUrl, `#${closedId}`)} закрыта и ` +
                    'осталась закрытой. Чтобы не путаться — работайте в новой.',
                TAG: `${NOTIFY_TAG_PREFIX}-${closedId}-${targetId}`,
            });
        } catch (error) {
            this.logger.warn(
                `[${ctx.domain}] уведомление о продолжении в #${targetId} ` +
                    `не отправлено: ${(error as Error).message}`,
            );
        }
    }

    private comment(dealId: number, lines: readonly string[]): Promise<void> {
        return addDealComment(this.bitrix, this.logger, dealId, lines);
    }
}
