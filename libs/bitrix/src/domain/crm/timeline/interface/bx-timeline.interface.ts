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
    /** Когда комментарий создан (только в ответе списка), ISO 8601. */
    CREATED?: string;
    FILES?: [string, string][];
}
