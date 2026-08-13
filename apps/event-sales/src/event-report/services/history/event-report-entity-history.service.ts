import dayjs from 'dayjs';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import { eventTypeName } from '../../types/event-report.event-codes';

/**
 * История изменений сущности-владельца (timeline-запись) — gsirk only.
 *
 * Добавляет комментарий в таймлайн владельца события (company / lead / сделка
 * без компании) через bitrix.batch.timeline.addTimelineComment
 * (crm.timeline.comment.add) — значения `EEventReportEntityType` совпадают с
 * ENTITY_TYPE этого API. Команда копится в batch-инстансе и уходит общим
 * callBatchWithConcurrency в конце event-report use-case.
 */
export class EventReportEntityHistoryService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.isGsirk) return;
        if (!ctx.entityId) return;

        const tz = this.portal.getTimezone();
        const stamp = dayjs(ctx.nowDate).tz(tz).format('DD.MM.YYYY HH:mm:ss');
        const comment = this.buildComment(ctx);

        // crm.timeline.comment.add — стабильное API записи в таймлайн любой
        // CRM-сущности. Репозиторий сам оборачивает payload в { fields },
        // поэтому передаём поля плоско (двойной { fields } ломает запись).
        const cmd = `add_history_${ctx.entityId}`;
        this.bitrix.batch.timeline.addTimelineComment(cmd, {
            ENTITY_TYPE: ctx.entityType,
            ENTITY_ID: ctx.entityId,
            COMMENT: `${stamp}\n${comment}`,
        });
    }

    /**
     * Таймлайн читают люди: тип события пишем русским названием
     * (`Заявка`), а не сырым кодом (`xoRequest`) — по коду запись мог
     * прочитать только разработчик.
     */
    private buildComment(ctx: EventReportContext): string {
        const parts: string[] = [];
        if (ctx.reportEventType) {
            parts.push(
                `Отчёт по событию: ${eventTypeName(ctx.reportEventType)}`,
            );
        }
        if (ctx.planEventType) {
            parts.push(`План: ${eventTypeName(ctx.planEventType)}`);
        }
        if (ctx.reportComment) {
            parts.push(`Комментарий: ${ctx.reportComment}`);
        }
        return parts.join('\n');
    }
}
