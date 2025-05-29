import { BitrixBaseApi, EBxNamespace, EBXEntity, EBxMethod } from "src/modules/bitrix/core";
import { IBXTimelineComment } from "../interface/bx-timeline.interface";

export class BxTimelineRepository {
    constructor(
        private readonly bxApi: BitrixBaseApi
    ) { }
    async addTimelineComment(data: IBXTimelineComment) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.ADD,
            { fields: data }
        );
    }
    addTimelineCommentBtch(cmd: string, data: IBXTimelineComment) {
        return this.bxApi.addCmdBatchType(
            cmd,
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.ADD,
            { fields: data }
        );
    }
}
