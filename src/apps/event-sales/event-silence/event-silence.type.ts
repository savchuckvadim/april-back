import { JobNames } from '@/modules/queue/constants/job-names.enum';

export type HooksCollectedData<T> = Record<string, T>;
export type EventSilentJobManagerHandler<T> = {
    collected: HooksCollectedData<T>;
    payload: { domain: string };
};

export interface EventSilentJobManagerData<T> {
    handler?: (handleData: EventSilentJobManagerHandler<T>) => Promise<void>;

    keyPrefix: string; // ключ для хранения данных в redis
    // ttlMs: number; // время жизни данных в redis - через сколько накопление данных перестает работать после последнего добавления по ключу
    data: T; // IColdCallData
    jobName: JobNames; // имя задачи
    domain: string; // домен
}

// export interface EventSilentJobManagerDispatchData<T> {
//     keyPrefix: string;
//     handlerId: JobNames;
//     payload: { domain: string };
//     ddosItem: EventSilentJobManagerData<T>;
// }
