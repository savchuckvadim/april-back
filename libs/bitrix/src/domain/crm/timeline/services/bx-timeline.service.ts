import { BxTimelineRepository } from '../repository/bx-timeline.repository';
import { IBXTimelineComment } from '../interface/bx-timeline.interface';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';

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

    async addTimelineComment(data: IBXTimelineComment) {
        return await this.repo.addTimelineComment(data);
    }

    /** Комментарии таймлайна сущности — например, для проверки «уже писали». */
    async getTimelineComments(
        filter: Partial<IBXTimelineComment>,
        select?: string[],
    ) {
        return await this.repo.getTimelineComments(filter, select);
    }
}
