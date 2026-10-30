import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import {
    crmCardUrl,
    timelineBold,
    timelineLink,
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
const NOTIFY_TAG_PREFIX = 'event-report-base-takeover';

/**
 * Перехват клиента (владелец 22.10.2026).
 *
 * У клиента открыта «ОП Основная» другого менеджера, а отчитался по нему
 * второй. Правило 25.08 не меняем: второму заводится СВОЯ сделка, чужая не
 * подхватывается. Но раньше это происходило молча, и первый менеджер не
 * знал, что его клиентом занялся коллега. Теперь:
 *  - запись в ленте обеих сделок со ссылкой на соседнюю;
 *  - уведомление ответственному прежней сделки.
 *
 * Вызывается после основного батча: id новой сделки известен только из его
 * ответа. Ошибки не роняют отчёт.
 *
 * Не @Injectable: инстанс Битрикса домена приходит в конструктор.
 */
export class BaseDealTakeoverNotice {
    private readonly logger = new Logger(BaseDealTakeoverNotice.name);

    constructor(private readonly bitrix: BitrixService) {}

    async notify(
        ctx: EventReportContext,
        deals: DealFlowResult,
        batchResults: IBitrixBatchResponseResult[],
    ): Promise<void> {
        const foreign = ctx.foreignBaseDeal as Record<string, unknown> | null;
        const foreignId = positiveId(foreign?.ID);
        if (!foreign || !foreignId) return;
        // Только когда отчёт завёл новую сделку: продолжение в существующей
        // своей сделке — не перехват.
        if (!deals.baseDealId?.startsWith('$result')) return;
        const newId = positiveId(
            findBatchResult<unknown>(batchResults, SET_BASE_DEAL_CMD),
        );
        const ownerId = positiveId(foreign.ASSIGNED_BY_ID);
        const takerId = positiveId(ctx.workResponsibleId);
        if (!newId || newId === foreignId || ownerId === takerId) return;

        const [ownerName, takerName] = await Promise.all([
            dealUserName(this.bitrix, ownerId),
            dealUserName(this.bitrix, takerId),
        ]);
        const foreignUrl = crmCardUrl(ctx.domain, 'deal', foreignId);
        const newUrl = crmCardUrl(ctx.domain, 'deal', newId);

        await addDealComment(this.bitrix, this.logger, foreignId, [
            `👥 ${timelineBold('Клиентом занялся другой менеджер')}`,
            `${takerName} отчитался по клиенту и завёл свою сделку ` +
                `${timelineLink(newUrl, `#${newId}`)}. Эта сделка остаётся ` +
                `у ${ownerName}.`,
        ]);
        await addDealComment(this.bitrix, this.logger, newId, [
            `👥 ${timelineBold('У клиента есть открытая сделка другого менеджера')}`,
            `Сделка ${timelineLink(foreignUrl, `#${foreignId}`)} — ` +
                `${ownerName}. Договоритесь, кто ведёт клиента.`,
        ]);

        if (!ownerId) return;
        try {
            await this.bitrix.imNotify.systemAdd({
                USER_ID: ownerId,
                MESSAGE:
                    `Вашим клиентом занялся ${takerName}: он отчитался и ` +
                    `завёл свою сделку ${pushLink(newUrl, `#${newId}`)}. ` +
                    `Ваша сделка ${pushLink(foreignUrl, `#${foreignId}`)} ` +
                    'остаётся у вас — договоритесь, кто ведёт клиента.',
                TAG: `${NOTIFY_TAG_PREFIX}-${foreignId}-${newId}`,
            });
        } catch (error) {
            this.logger.warn(
                `[${ctx.domain}] уведомление о перехвате #${foreignId} → ` +
                    `#${newId} не отправлено: ${(error as Error).message}`,
            );
        }
    }
}
