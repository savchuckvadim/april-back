import { JobNames } from '@/modules/queue/constants/job-names.enum';
export const SILENCE_EVENT_PREFIX = 'silence';
export type HooksCollectedData<T> = Record<string, T>;
export type EventSilentJobManagerHandler<T> = {
    collected: HooksCollectedData<T>;
    payload: { domain: string };
};

export interface EventSilentJobManagerData<T> {
    keyPrefix: string;
    data: T;
    jobName: JobNames;
    domain: string;
}

