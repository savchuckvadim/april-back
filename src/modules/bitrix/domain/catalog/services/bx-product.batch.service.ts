import { BitrixBaseApi } from "@/modules/bitrix/core/base/bitrix-base-api";
import { BxProductRepository } from "../repository/bx-product.repository";
import { IBXProduct } from "../interface/bx-product.interface";


export class BxProductBatchService {
    private repo: BxProductRepository

    clone(api: BitrixBaseApi): BxProductBatchService {
        const instance = new BxProductBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxProductRepository(api);
    }
 
    async get(cmdCode: string, id: number | string, select?: Partial<IBXProduct>) {
        return await this.repo.getBatch(cmdCode, id, select);
    }
    async getList(cmdCode: string, filter: Partial<IBXProduct>, select: (keyof IBXProduct)[]) {
        return await this.repo.getListBatch(cmdCode, filter, select);
    }
}