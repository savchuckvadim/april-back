import {
    BitrixBaseApi,
    EBxNamespace,
    EBXEntity,
    EBxMethod,
} from 'src/modules/bitrix/core';
import type { BitrixCallOptions } from 'src/modules/bitrix/core/base/call-api.service';
import {
    IBXTimelineComment,
    IBXTimelineLogMessage,
} from '../interface/bx-timeline.interface';

/** Сортировка списка комментариев: Битрикс понимает ID, CREATED, AUTHOR_ID. */
export type TimelineCommentOrder = Partial<
    Record<'ID' | 'CREATED' | 'AUTHOR_ID', 'ASC' | 'DESC'>
>;

export class BxTimelineRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    /**
     * Служебная лог-запись таймлайна: crm.timeline.logmessage.add.
     * options.retries = 0 — без автоповтора (повтор после таймаута мог бы
     * оставить вторую запись).
     */
    async addLogMessage(
        data: IBXTimelineLogMessage,
        options?: BitrixCallOptions,
    ) {
        return options
            ? await this.bxApi.callType(
                  EBxNamespace.CRM,
                  EBXEntity.TIMELINE_LOG_MESSAGE,
                  EBxMethod.ADD,
                  { fields: data },
                  options,
              )
            : await this.bxApi.callType(
                  EBxNamespace.CRM,
                  EBXEntity.TIMELINE_LOG_MESSAGE,
                  EBxMethod.ADD,
                  { fields: data },
              );
    }

    addLogMessageBtch(cmd: string, data: IBXTimelineLogMessage) {
        return this.bxApi.addCmdBatchType(
            cmd,
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_LOG_MESSAGE,
            EBxMethod.ADD,
            { fields: data },
        );
    }

    /** options.retries = 0 — без автоповтора: повтор мог бы дать второй комментарий. */
    async addTimelineComment(
        data: IBXTimelineComment,
        options?: BitrixCallOptions,
    ) {
        return options
            ? await this.bxApi.callType(
                  EBxNamespace.CRM,
                  EBXEntity.TIMELINE_COMMENT,
                  EBxMethod.ADD,
                  { fields: data },
                  options,
              )
            : await this.bxApi.callType(
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
