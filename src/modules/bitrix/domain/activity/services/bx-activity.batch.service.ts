import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BxActivityRepository } from "../bx-activity.repository";
import { IBXActivity } from "../interfaces/bx-activity.interface";


export class BxActivityBatchService {
    private repo: BxActivityRepository;

    clone(api: BitrixBaseApi): BxActivityBatchService {
        const instance = new BxActivityBatchService();
        instance.init(api);
        return instance;
    }
    init(api: BitrixBaseApi) {
        this.repo = new BxActivityRepository(api);
    }

    async get(cmdCode: string, activityId: number | string) {
        return this.repo.getBtch(cmdCode, activityId);
    }
    async create(cmdCode: string, data:  Partial<IBXActivity>) {
        return this.repo.createBtch(cmdCode, data);
    }
    async update(cmdCode: string, activityId: number | string, data:  Partial<IBXActivity>) {
        return this.repo.updateBtch(cmdCode, activityId, data);
    }
    async delete(cmdCode: string, activityId: number | string) {
        return this.repo.deleteBtch(cmdCode, activityId);
    }
    
    
}

