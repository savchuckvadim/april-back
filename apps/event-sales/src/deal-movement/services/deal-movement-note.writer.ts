import { BitrixService } from '@lib/bitrix';
import {
    BitrixEntityType,
    BitrixOwnerTypeId,
} from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import {
    DEAL_MOVEMENT_NOTE_KIND,
    type DealMovementNoteKind,
} from '@lib/portal-lib/store/app-settings';
import {
    dealMovementCommentText,
    type DealMovementNote,
} from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_NOTES } from '../constants/deal-movement.const';

/**
 * Без автоповтора: запись не идемпотентна — повтор после таймаута мог бы
 * оставить в ленте вторую такую же запись.
 */
const NO_RETRY = { retries: 0 } as const;

/** Битрикс ответил без результата — запись не считается сделанной. */
const requireResult = (dealId: number, result: unknown): void => {
    if (result === undefined || result === null || result === false) {
        throw new Error(
            `сделка ${dealId}: Битрикс не подтвердил запись в ленту`,
        );
    }
};

/**
 * Запись в ленту ОДНОЙ сделки: комментарий (`crm.timeline.comment.add`)
 * или служебная запись журнала (`crm.timeline.logmessage.add`). Одиночный
 * вызов, не пачка (решение 17.11.2026).
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром на один прогон
 * портала (CLAUDE.md — иначе гонка между порталами).
 */
export class DealMovementNoteWriter {
    constructor(private readonly bitrix: BitrixService) {}

    /** Запись движения сделок выбранным на портале видом. */
    async write(
        dealId: number,
        note: DealMovementNote,
        kind: DealMovementNoteKind,
    ): Promise<void> {
        if (kind === DEAL_MOVEMENT_NOTE_KIND.logMessage) {
            await this.writeLogMessage(dealId, note.title, note.text);
            return;
        }
        await this.writeComment(dealId, dealMovementCommentText(note));
    }

    async writeComment(dealId: number, text: string): Promise<void> {
        const response = await this.bitrix.timeline.addTimelineComment(
            {
                ENTITY_ID: dealId,
                ENTITY_TYPE: BitrixEntityType.DEAL,
                COMMENT: text,
            },
            NO_RETRY,
        );
        requireResult(dealId, response?.result);
    }

    async writeLogMessage(
        dealId: number,
        title: string,
        text: string,
    ): Promise<void> {
        const response = await this.bitrix.timeline.addLogMessage(
            {
                entityTypeId: BitrixOwnerTypeId.DEAL,
                entityId: dealId,
                title,
                text,
                iconCode: DEAL_MOVEMENT_NOTES.logMessageIcon,
            },
            NO_RETRY,
        );
        requireResult(dealId, response?.result);
    }
}
