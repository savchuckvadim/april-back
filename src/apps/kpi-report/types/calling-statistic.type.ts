import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";

export const CALLING_TYPES = [
    {
        id: 'all',
        action: 'Наборов номера',
    },
    {
        id: 30,
        action: 'Звонки > 30 сек',
    },
    {
        id: 60,
        action: 'Звонки > минуты',
    },
    {
        id: 180,
        action: 'Звонки > 3 минут',
    },
    {
        id: 300,
        action: 'Звонки > 5 минут',
    },
    {
        id: 600,
        action: 'Звонки > 10 минут',
    },
] as const;


export type CallingDuration = typeof CALLING_TYPES[number]['id'];
// "all" | 30 | 60 | 180 | 300 | 600
export type CallingTypeAction = typeof CALLING_TYPES[number]['action'];
// "Наборов номера" | "Звонки > 30 сек" | ...

export type VoximplantFilter = {
    PORTAL_USER_ID: number | string;
    '>CALL_START_DATE': string;
    '<CALL_START_DATE': string;
    '>CALL_DURATION'?: Exclude<CallingDuration, 'all'>;
};

export interface ICallingStatisticResult {
    user: IBXUser;
    userName: string;
    callings: {
        id: CallingDuration;
        action: CallingTypeAction;
        count: number;
        duration: number;
    }[];
}


