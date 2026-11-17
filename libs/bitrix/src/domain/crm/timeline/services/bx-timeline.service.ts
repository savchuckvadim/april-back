import {
    BxTimelineRepository,
    type TimelineCommentOrder,
} from '../repository/bx-timeline.repository';
import {
    IBXTimelineComment,
    IBXTimelineLogMessage,
} from '../interface/bx-timeline.interface';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import type { BitrixCallOptions } from 'src/modules/bitrix/core/base/call-api.service';

export class BxTimelineService {
    private repo: BxTimelineRepository;

    clone(api: BitrixBaseApi): BxTimelineService {
        const instance = new BxTimelineService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxTimelineRepository(api);
    }

    /** options.retries = 0 — без автоповтора (запись не идемпотентна). */
    async addTimelineComment(
        data: IBXTimelineComment,
        options?: BitrixCallOptions,
    ) {
        return await this.repo.addTimelineComment(data, options);
    }

    /** Служебная лог-запись таймлайна (crm.timeline.logmessage.add). */
    async addLogMessage(
        data: IBXTimelineLogMessage,
        options?: BitrixCallOptions,
    ) {
        return await this.repo.addLogMessage(data, options);
    }

    /**
     * Комментарии таймлайна сущности — например, для проверки «уже писали».
     * Одна страница (до 50); `order: { ID: 'DESC' }` — самые свежие.
     */
    async getTimelineComments(
        filter: Partial<IBXTimelineComment>,
        select?: string[],
        order?: TimelineCommentOrder,
    ) {
        return await this.repo.getTimelineComments(filter, select, order);
    }

    /** Замена текста комментария таймлайна. */
    async updateTimelineComment(id: number | string, comment: string) {
        return await this.repo.updateTimelineComment(id, comment);
    }
}
