import { BxActivityRepository } from '../bx-activity.repository';
import {
    BXActivityRequestFields,
    IBXActivity,
} from '../interfaces/bx-activity.interface';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';

export class ActivityService {
    private repo: BxActivityRepository;

    clone(api: BitrixBaseApi): ActivityService {
        const instance = new ActivityService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxActivityRepository(api);
    }
    async get(id: number) {
        return await this.repo.get(id);
    }
    async getAll(
        filter: Partial<BXActivityRequestFields>,
        select?: string[],
        limit?: number,
    ) {
        return await this.repo.getAll(filter, select, limit);
    }
    async getAllFresh(
        filter: Partial<BXActivityRequestFields>,
        select?: string[],
        limit?: number,
    ) {
        return await this.repo.getAllFresh(filter, select, limit);
    }
    async getList(filter: Partial<BXActivityRequestFields>, select?: string[]) {
        return await this.repo.getList(filter, select);
    }
    async createActivity(activity: IBXActivity) {
        return this.repo.create(activity);
    }

    async updateActivity(id: number | string, activity: IBXActivity) {
        return this.repo.update(id, activity);
    }

    async deleteActivity(id: number | string) {
        return this.repo.delete(id);
    }

    /**
     * Привязка существующей активности к дополнительной сущности CRM
     * (`crm.activity.binding.add`): запись активности (звонок с плеером)
     * появляется в таймлайне целевой сущности в родном виде.
     * Для смарт-процессов entityTypeId — их «большой» id (напр. 1056).
     */
    async addBinding(
        activityId: number | string,
        entityTypeId: number,
        entityId: number | string,
    ) {
        return this.repo.addBinding(activityId, entityTypeId, entityId);
    }

    /** Снятие привязки активности (`crm.activity.binding.delete`). */
    async deleteBinding(
        activityId: number | string,
        entityTypeId: number,
        entityId: number | string,
    ) {
        return this.repo.deleteBinding(activityId, entityTypeId, entityId);
    }
}
