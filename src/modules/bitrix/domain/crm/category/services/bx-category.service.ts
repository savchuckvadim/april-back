import { Injectable } from "@nestjs/common";
import { BxCategoryRepository } from "../repository/bx-category.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BitrixOwnerTypeId } from "src/modules/bitrix/domain/enums/bitrix-constants.enum";


@Injectable()
export class BxCategoryService {
    private repo: BxCategoryRepository
    constructor() { }

    init(api: BitrixBaseApi) {
        this.repo = new BxCategoryRepository(api);
    }
    async get(id: number | string, entityTypeId: BitrixOwnerTypeId | string) {
        return await this.repo.get(id, entityTypeId);
    }
    async getList(entityTypeId: BitrixOwnerTypeId | string) {
        return await this.repo.getList(entityTypeId);
    }
}
