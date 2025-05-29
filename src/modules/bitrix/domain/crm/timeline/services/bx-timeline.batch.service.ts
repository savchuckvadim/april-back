import { Injectable } from "@nestjs/common";
import { BxTimelineRepository } from "../repository/bx-timeline.repository";
import { IBXTimelineComment } from "../interface/bx-timeline.interface";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";


@Injectable()
export class BxTimelineBatchService {
    private repo: BxTimelineRepository
    constructor() { }

    init(api: BitrixBaseApi) {
        this.repo = new BxTimelineRepository(api);
    }
    addTimelineComment(cmd: string, data: IBXTimelineComment) {
        return this.repo.addTimelineCommentBtch(cmd, data);
    }
}