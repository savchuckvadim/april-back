import { BitrixService } from '@/modules/bitrix';
import { BATCH_LINE_BREAK_SYMBOL } from '@lib/bitrix/consts/batch.consts';
import { EventReportContext } from '../context/event-report.context';
import { buildEventHistoryParts } from './event-history-comment.builder';

/**
 * История изменений сущности-владельца (timeline-запись) — gsirk only.
 *
 * Добавляет комментарий в таймлайн владельца события (company / lead / сделка
 * без компании) через bitrix.batch.timeline.addTimelineComment
 * (crm.timeline.comment.add) — значения `EEventReportEntityType` совпадают с
 * ENTITY_TYPE этого API. Команда копится в batch-инстансе и уходит общим
 * callBatchWithConcurrency в конце event-report use-case.
 *
 * Формат записи — общий с полем `op_mhistory` карточки
 * (см. buildEventHistoryParts): первой строкой дата-время события, дальше
 * «Звонок совершён: <комментарий>» и «Запланирована Презентация на …».
 * Переносы — через BATCH_LINE_BREAK_SYMBOL: комментарий уходит
 * batch-командой, и сырой `\n` доезжает подчёркиванием.
 *
 * PortalModel сервису не нужен: таймзону для отметки времени знает контекст
 * (`ctx.dateTime`), а больше портальных данных здесь нет.
 */
export class EventReportEntityHistoryService {
    constructor(private readonly bitrix: BitrixService) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.isGsirk) return;
        if (!ctx.entityId) return;

        const stamp = ctx.dateTime.crmDateTime(ctx.nowDate);
        const parts = buildEventHistoryParts(ctx);

        // crm.timeline.comment.add — стабильное API записи в таймлайн любой
        // CRM-сущности. Репозиторий сам оборачивает payload в { fields },
        // поэтому передаём поля плоско (двойной { fields } ломает запись).
        const cmd = `add_history_${ctx.entityId}`;
        this.bitrix.batch.timeline.addTimelineComment(cmd, {
            ENTITY_TYPE: ctx.entityType,
            ENTITY_ID: ctx.entityId,
            COMMENT: [stamp, ...parts].join(BATCH_LINE_BREAK_SYMBOL),
        });
    }
}
