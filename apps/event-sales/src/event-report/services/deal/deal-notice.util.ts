import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { BitrixEntityType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { toTimelineCommentDirect } from '@lib/bitrix/consts/timeline.consts';

/**
 * Общее у записей отчёта о судьбе основной сделки (продолжение работы из
 * закрытой, перехват клиента другим менеджером).
 */

/** Положительный целый id из значения Битрикса; иначе null. */
export const positiveId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
};

/** Ссылка на сделку в push (BB-код: в уведомлении рендерится он, не HTML). */
export const pushLink = (url: string, text: string): string =>
    `[URL=${url}]${text}[/URL]`;

/**
 * Комментарий в ленту сделки прямым вызовом (после основного батча).
 * Ошибка не роняет отчёт — только строка в логе.
 */
export const addDealComment = async (
    bitrix: BitrixService,
    logger: Logger,
    dealId: number,
    lines: readonly string[],
): Promise<void> => {
    try {
        await bitrix.timeline.addTimelineComment({
            ENTITY_TYPE: BitrixEntityType.DEAL,
            ENTITY_ID: dealId,
            COMMENT: toTimelineCommentDirect(lines),
        });
    } catch (error) {
        logger.warn(
            `запись в ленту сделки #${dealId} не добавлена: ` +
                (error as Error).message,
        );
    }
};
