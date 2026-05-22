import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxActivityRepository } from '../bx-activity.repository';
import { IBXActivity } from '../interfaces/bx-activity.interface';

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

    get(cmdCode: string, activityId: number | string) {
        return this.repo.getBtch(cmdCode, activityId);
    }
    create(cmdCode: string, data: Partial<IBXActivity>) {
        return this.repo.createBtch(cmdCode, data);
    }
    update(
        cmdCode: string,
        activityId: number | string,
        data: Partial<IBXActivity>,
    ) {
        return this.repo.updateBtch(cmdCode, activityId, data);
    }
    delete(cmdCode: string, activityId: number | string) {
        return this.repo.deleteBtch(cmdCode, activityId);
    }
}
