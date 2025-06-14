import { BitrixBaseApi } from "@/modules/bitrix/core/base/bitrix-base-api";
import { BxProductRepository } from "../repository/bx-product.repository";
import { IBXProduct } from "../interface/bx-product.interface";


export class BxProductService {
    private repo: BxProductRepository

    clone(api: BitrixBaseApi): BxProductService {
        const instance = new BxProductService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxProductRepository(api);
    }
    async get(id: number | string, select?: Partial<IBXProduct>) {
        return await this.repo.get(id, select);
    }

    async getList(filter: Partial<IBXProduct>, select: (keyof IBXProduct)[]) {
        return await this.repo.getList(filter, select);
    }
}