import { BitrixEntityType } from 'src/modules/bitrix';

export interface IBXTimelineComment {
    ID?: number | string;
    ENTITY_ID: number | string;
    ENTITY_TYPE: BitrixEntityType | string;
    COMMENT: string;
    /**
     * Автор комментария. REST-метод crm.timeline.comment.add его не требует:
     * без AUTHOR_ID комментарий пишется от имени пользователя вебхука/токена.
     */
    AUTHOR_ID?: string;
    FILES?: [string, string][];
}

/**
 * Поля служебной лог-записи таймлайна (crm.timeline.logmessage.add, поле
 * `fields`). Состав — строго по официальной документации метода:
 * https://apidocs.bitrix24.ru/api-reference/crm/timeline/logmessage/crm-timeline-logmessage-add.html
 */
export interface IBXTimelineLogMessage {
    /** Тип сущности (2 — сделка, 1 — лид, id смарт-процесса). */
    entityTypeId: number;
    /** Элемент сущности, в которой создаётся запись. */
    entityId: number;
    title: string;
    text: string;
    /** Код иконки (crm.timeline.icon.list), например `info`. */
    iconCode: string;
}

/** Ответ crm.timeline.logmessage.add: созданная запись. */
export interface IBXTimelineLogMessageResult {
    logMessage: {
        id: number;
        created: string;
        authorId: number;
        title: string;
        text: string;
        iconCode: string;
    };
}
