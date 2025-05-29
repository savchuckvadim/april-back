import { EBxMethod } from "src/modules/bitrix/core";
import { CrmAddRequestType } from "../../type/crm-request.type";
import { IBXTimelineComment } from "../interface/bx-timeline.interface";


export type TimelineCommentSchema = {
    [EBxMethod.ADD]: {
        request: CrmAddRequestType<IBXTimelineComment>;
        response: {result:number};
    };
}
