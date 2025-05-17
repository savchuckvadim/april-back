import { EBxMethod } from "src/modules/bitrix/core";
import { IBXTask } from "../interfaces/bitrix.interface";
import { CrmListRequestType } from "../crm/type/crm-request.type";
import { BXTaskRequestFields } from "./bx-tasks.interface";



export type TasksSchema = {
    [EBxMethod.GET]: {
        request: { id: number | string };
        response: IBXTask;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<BXTaskRequestFields>;
        response: { tasks: IBXTask[] };
    };
    [EBxMethod.UPDATE]: {
        request: {
            taskId: number | string
            fields: Partial<IBXTask>
        };
        response: { tasks: IBXTask[] };
    };
    [EBxMethod.DELETE]: {
        request: { id: number | string };
        response: { taskId: number };
    };
};
