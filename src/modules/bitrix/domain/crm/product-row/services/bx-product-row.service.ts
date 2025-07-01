import { Injectable } from "@nestjs/common";
import { BxProductRowRepository } from "../repository/bx-product-row.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { IBXProductRow } from "../interface/bx-product-row.interface";
import { ListProductRowDto } from "../dto/list-product-row.sto";

@Injectable()
export class BxProductRowService {
    private repo: BxProductRowRepository
    constructor() { }

    init(api: BitrixBaseApi) {
        this.repo = new BxProductRowRepository(api);
    }

    async set(data: IBXProductRow) {
        return await this.repo.set(data);
    }
    async list(data: ListProductRowDto) {
        return await this.repo.list(data);
    }

} 