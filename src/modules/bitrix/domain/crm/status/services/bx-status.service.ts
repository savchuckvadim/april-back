import { Injectable } from "@nestjs/common";
import { BxStatusRepository } from "../repository/bx-status.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { IBXStatus } from "../interface/bx-status.interface";


@Injectable()
export class BxStatusService {
    private repo: BxStatusRepository
    constructor() { }

    init(api: BitrixBaseApi) {
        this.repo = new BxStatusRepository(api);
    }

    getList(filter: Partial<IBXStatus>) {
        return this.repo.getList(filter);
    }
}
