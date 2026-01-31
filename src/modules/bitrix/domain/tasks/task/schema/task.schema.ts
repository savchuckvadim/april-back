import { EBxMethod } from 'src/modules/bitrix/core';
import { IBXTask } from '../../../interfaces/bitrix.interface';
import { ITaskCreateFields, ITaskUpdateFields } from '../interface/task.interface';

/**
 * Schema для всех методов задач
 */
export type TaskSchema = {
    [EBxMethod.ADD]: {
        request: {
            fields: ITaskCreateFields;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.UPDATE]: {
        request: {
            taskId: number | string;
            fields: ITaskUpdateFields;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.GET]: {
        request: {
            taskId: number | string;
            select?: string[];
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.LIST]: {
        request: {
            filter?: Partial<IBXTask>;
            select?: string[];
            order?: { [key in keyof IBXTask]?: 'asc' | 'desc' | 'ASC' | 'DESC' };
            start?: number;
        };
        response: {
            tasks: IBXTask[];
            total?: number;
        };
    };
    [EBxMethod.DELETE]: {
        request: {
            taskId: number | string;
        };
        response: {
            taskId: number;
        };
    };
    [EBxMethod.FILES_ATTACH]: {
        request: {
            taskId: number | string;
            files: number[];
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.DELEGATE]: {
        request: {
            taskId: number | string;
            userId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.COUNTERS_GET]: {
        request: {
            userId?: number | string;
        };
        response: {
            counters: any;
        };
    };
    [EBxMethod.START]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.PAUSE]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.DEFER]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.COMPLETE]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.RENEW]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.APPROVE]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.DISAPPROVE]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.STARTWATCH]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.STOPWATCH]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.FAVORITE_ADD]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.FAVORITE_REMOVE]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.GET_FIELDS]: {
        request: Record<string, never>;
        response: {
            fields: any;
        };
    };
    [EBxMethod.GET_ACCESS]: {
        request: {
            taskId: number | string;
        };
        response: {
            access: any;
        };
    };
    [EBxMethod.HISTORY_LIST]: {
        request: {
            taskId: number | string;
            start?: number;
        };
        response: {
            history: any[];
        };
    };
    [EBxMethod.MUTE]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
    [EBxMethod.UNMUTE]: {
        request: {
            taskId: number | string;
        };
        response: {
            task: IBXTask;
        };
    };
};
