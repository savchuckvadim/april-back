import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { BitrixEntityType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import {
    crmCardUrl,
    timelineBold,
    timelineLink,
    timelineText,
    toTimelineComment,
} from '@lib/bitrix/consts/timeline.consts';
import { getErrorDetails } from '@/shared';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';
import { historyActor } from '../../../shared/lead-request/lead-request-history.util';

/** Одна передача по SLA — для комментариев в таймлайн. */
export interface ISlaTransferTimelineInput {
    leadId: number;
    leadTitle: string;
    /** Основная сделка заявки; null — комментарий только в лид. */
    dealId: number | null;
    /** Сколько рабочих минут давалось на подтверждение. */
    minutes: number;
    /** Кто не подтвердил. */
    previousResponsibleId: number;
    /** Кому заявка ушла по кругу. */
    responsibleId: number;
}

/** Итог прогона по одному лиду — ровно то, что нужно отбору. */
export interface ISlaTransferCandidate {
    item: ILeadToWorkItem;
    leadTitle?: string;
    responsible?: number;
    previousResponsibleId?: number | null;
    dealId: number | null;
    error?: string;
}

/**
 * Отбор передач по SLA из итогов прогона: признак `sla` ставит только крон,
 * а комментарий нужен, лишь когда ответственный РЕАЛЬНО сменился. Единственный
 * кандидат в отделе получает заявку назад — писать «передана» было бы ложью,
 * руководителю об этом уже сообщил сам SLA.
 */
export function collectSlaTransfers(
    entries: readonly ISlaTransferCandidate[],
): ISlaTransferTimelineInput[] {
    const transfers: ISlaTransferTimelineInput[] = [];
    for (const entry of entries) {
        const { item, responsible, previousResponsibleId } = entry;
        if (!item.sla || entry.error || !responsible) continue;
        if (!previousResponsibleId || previousResponsibleId === responsible) {
            continue;
        }
        transfers.push({
            leadId: item.leadId,
            leadTitle: entry.leadTitle ?? `Лид ${item.leadId}`,
            dealId: entry.dealId,
            minutes: item.sla.minutes,
            previousResponsibleId,
            responsibleId: responsible,
        });
    }
    return transfers;
}

/**
 * Комментарий о передаче по SLA — в таймлайн лида и основной сделки.
 *
 * Зачем: историю заявки (UF-поле лида) менеджеры и руководители не читают,
 * они смотрят ленту карточки. 02.11.2026 на garant передачу сделки 110469
 * сочли ручной: в ленте не было ни слова, кто передал и почему.
 *
 * Пишется ПОСЛЕ основного батча отдельным проводом: назначение уже
 * состоялось, и комментарий не соврёт; его падение операцию не роняет
 * (предупреждение в результат). Ссылки — html, как положено таймлайну.
 *
 * НЕ @Injectable: `new` с per-domain инстансом Битрикса (правило CLAUDE.md).
 */
export class LeadToWorkSlaTimelineService {
    private readonly logger = new Logger(LeadToWorkSlaTimelineService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly domain: string,
        /** Имена сотрудников пачки; нет имени — id. */
        private readonly names: Readonly<Record<number, string>> = {},
    ) {}

    /** Возвращает предупреждения, не бросает. */
    async write(transfers: ISlaTransferTimelineInput[]): Promise<string[]> {
        if (!transfers.length) return [];
        const warnings: string[] = [];

        for (const transfer of transfers) {
            this.bitrix.batch.timeline.addTimelineComment(
                `lw_sla_tl_lead_${transfer.leadId}`,
                {
                    ENTITY_ID: transfer.leadId,
                    ENTITY_TYPE: BitrixEntityType.LEAD,
                    COMMENT: toTimelineComment(this.lines(transfer, 'lead')),
                },
            );
            if (transfer.dealId) {
                this.bitrix.batch.timeline.addTimelineComment(
                    `lw_sla_tl_deal_${transfer.dealId}`,
                    {
                        ENTITY_ID: transfer.dealId,
                        ENTITY_TYPE: BitrixEntityType.DEAL,
                        COMMENT: toTimelineComment(
                            this.lines(transfer, 'deal'),
                        ),
                    },
                );
            }
        }

        try {
            await this.bitrix.api.callBatchWithConcurrency(1);
            this.logger.log(
                `[sla-timeline] ${this.domain}: комментариев о передаче ${transfers.length}`,
            );
        } catch (error) {
            const text = `Комментарий о передаче по SLA не записан: ${getErrorDetails(error).message}`;
            warnings.push(text);
            this.logger.warn(text);
        }
        return warnings;
    }

    /**
     * Текст — для людей: кто не подтвердил, кому ушло и что делать. Без
     * кодов и жаргона (правило клиентских текстов); ссылка на вторую
     * карточку, чтобы из сделки дойти до заявки и обратно одним кликом.
     */
    private lines(
        transfer: ISlaTransferTimelineInput,
        target: 'lead' | 'deal',
    ): string[] {
        const from = timelineText(
            String(historyActor(this.names, transfer.previousResponsibleId)),
        );
        const to = timelineText(
            String(historyActor(this.names, transfer.responsibleId)),
        );
        const lines = [
            timelineBold('Заявка передана: не подтверждена в срок'),
            `Заявка не подтверждена за ${transfer.minutes} рабочих минут: ${from}.`,
            `Передана автоматически по кругу отдела. Новый ответственный: ${to}.`,
            `Что сделать: подтвердить заявку в «Звонках» в течение ${transfer.minutes} рабочих минут.`,
        ];
        if (target === 'lead' && transfer.dealId) {
            lines.push(
                `Сделка: ${timelineLink(
                    crmCardUrl(this.domain, 'deal', transfer.dealId),
                    `№${transfer.dealId}`,
                )}`,
            );
        }
        if (target === 'deal') {
            lines.push(
                `Заявка: ${timelineLink(
                    crmCardUrl(this.domain, 'lead', transfer.leadId),
                    `${transfer.leadTitle} (лид #${transfer.leadId})`,
                )}`,
            );
        }
        return lines;
    }
}
