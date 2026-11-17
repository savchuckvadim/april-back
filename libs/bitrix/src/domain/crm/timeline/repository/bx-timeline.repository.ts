import {
    BitrixBaseApi,
    EBxNamespace,
    EBXEntity,
    EBxMethod,
} from 'src/modules/bitrix/core';
import { IBXTimelineComment } from '../interface/bx-timeline.interface';

/** Сортировка списка комментариев: Битрикс понимает ID, CREATED, AUTHOR_ID. */
export type TimelineCommentOrder = Partial<
    Record<'ID' | 'CREATED' | 'AUTHOR_ID', 'ASC' | 'DESC'>
>;

export class BxTimelineRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}
    async addTimelineComment(data: IBXTimelineComment) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.ADD,
            { fields: data },
        );
    }
    addTimelineCommentBtch(cmd: string, data: IBXTimelineComment) {
        return this.bxApi.addCmdBatchType(
            cmd,
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    /**
     * Список комментариев таймлайна сущности (фильтр по ENTITY_TYPE/ENTITY_ID).
     * Одна страница — до 50 записей; `order` (например `{ ID: 'DESC' }`)
     * нужен, когда важны самые свежие: без него порядок задаёт Битрикс.
     */
    async getTimelineComments(
        filter: Partial<IBXTimelineComment>,
        select?: string[],
        order?: TimelineCommentOrder,
    ) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.LIST,
            order
                ? { filter, select, order, start: -1 }
                : { filter, select, start: -1 },
        );
    }

    /**
     * Замена текста комментария (crm.timeline.comment.update). Файлы
     * комментария не трогаются: передаётся только COMMENT.
     */
    async updateTimelineComment(id: number | string, comment: string) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.UPDATE,
            { id, fields: { COMMENT: comment } },
        );
    }

    getTimelineCommentsBtch(
        cmd: string,
        filter: Partial<IBXTimelineComment>,
        select?: string[],
    ) {
        return this.bxApi.addCmdBatchType(
            cmd,
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.LIST,
            { filter, select, start: -1 },
        );
    }
}
