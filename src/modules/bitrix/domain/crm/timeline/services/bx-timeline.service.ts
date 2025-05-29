import { Injectable } from "@nestjs/common";
import { BxTimelineRepository } from "../repository/bx-timeline.repository";
import { IBXTimelineComment } from "../interface/bx-timeline.interface";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";

@Injectable()
export class BxTimelineService {
    private repo: BxTimelineRepository
    constructor(

    ) { }

    init(api: BitrixBaseApi) {
        this.repo = new BxTimelineRepository(api);
    }


    async addTimelineComment(data: IBXTimelineComment) {
        return await this.repo.addTimelineComment(data);
    }
}
