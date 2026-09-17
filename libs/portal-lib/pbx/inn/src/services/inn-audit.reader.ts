import { Logger } from '@nestjs/common';
import { INN_AUDIT_MARKER, parseInnAuditComment } from '../lib/inn-audit.codec';
import { IInnBitrix, innRows, innText } from '../lib/inn-row.util';
import { IInnAuditEvent } from '../type/inn.type';

/**
 * Чтение аудита ИНН из таймлайна сделки.
 *
 * Отдельного журнала у выбора ИНН нет (решение владельца 17.09.2026),
 * поэтому история читается там же, где её видит человек. Комментарии
 * отдаются страницами по 50 в порядке убывания ID; мы берём несколько
 * последних страниц — на живой сделке записей об ИНН единицы, и они всегда
 * свежие.
 */

/** Сколько страниц таймлайна просматриваем. Страница — 50 комментариев. */
const MAX_PAGES = 3;
const PAGE_SIZE = 50;

export class InnAuditReader {
    private readonly logger = new Logger(InnAuditReader.name);

    constructor(private readonly bitrix: IInnBitrix) {}

    /** События аудита по возрастанию времени (старые — первыми). */
    async read(dealId: number): Promise<IInnAuditEvent[]> {
        const events: IInnAuditEvent[] = [];
        try {
            for (let page = 0; page < MAX_PAGES; page += 1) {
                const rows = innRows(
                    await this.bitrix.api.call('crm.timeline.comment.list', {
                        filter: { ENTITY_ID: dealId, ENTITY_TYPE: 'deal' },
                        select: ['ID', 'CREATED', 'COMMENT', 'AUTHOR_ID'],
                        order: { ID: 'DESC' },
                        start: page * PAGE_SIZE,
                    }),
                );
                for (const row of rows) {
                    const comment = innText(row.COMMENT);
                    if (!comment.includes(INN_AUDIT_MARKER)) continue;
                    const event = parseInnAuditComment({
                        comment,
                        created: innText(row.CREATED),
                    });
                    if (event) events.push(event);
                }
                if (rows.length < PAGE_SIZE) break;
            }
        } catch (error) {
            this.logger.warn(
                `Таймлайн сделки ${dealId} не прочитан: ` +
                    (error as Error).message,
            );
        }
        // Читали от новых к старым — свёртка ждёт обратного порядка.
        return events.reverse();
    }
}
