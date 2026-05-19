// import {
//     AlfaActivityData,
//     AlfaPayload,
// } from '@/modules/hooks/alfa/types/alfa-activity-data.interface';
// import { SilentJobHandlerId } from '@/core/silence/constants/silent-job-handlers.enum';
// import { IColdHookSilenceHandlerData } from '@/apps/event-sales/cold-hook';

// // type HandlerFn<T = any, P = any> = (collected: Record<string, T>, payload: P) => Promise<void>;
// export type HandlerMap = {
//     [SilentJobHandlerId.CREATE_ACTIVITY]: {
//         collected: Record<string, AlfaActivityData>;
//         payload: AlfaPayload;
//     };
//     [SilentJobHandlerId.EVENT_SALES_COLD_CALL]: IColdHookSilenceHandlerData;
// };
// export type HandlerFn<K extends keyof HandlerMap> = (
//     collected: HandlerMap[K]['collected'],
//     payload: HandlerMap[K]['payload'],
// ) => Promise<void>;
