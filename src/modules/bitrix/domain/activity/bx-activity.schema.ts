import { EBxMethod } from "src/modules/bitrix/core";
import { IBXTask } from "../interfaces/bitrix.interface";
import { CrmListRequestType } from "../crm/type/crm-request.type";
import { BXActivityRequest, BXActivityRequestFields, IBXActivity } from "./interfaces/bx-activity.interface";




export type ActivitySchema = {
    [EBxMethod.GET]: {
        request: { id: number | string };
        response: IBXTask;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<BXActivityRequestFields>;
        response: IBXActivity[];
    };
    [EBxMethod.UPDATE]: {
        request: {
            taskId: number | string
            fields: Partial<IBXTask>
        };
        response: { tasks: IBXTask[] };
    };

};
