import { IBitrixBatchResponseResult, IBitrixResponse } from "./bitrix-api-http.intterface";

import { BXApiSchema } from "../domain";
import { TBXRequest } from "../domain";
import { TBXResponse } from "../domain";
import { IPortal } from "src/modules/portal/interfaces/portal.interface";
import { Logger } from "@nestjs/common";

import { TelegramService } from "@/modules/telegram/telegram.service";
import { HttpService } from "@nestjs/axios";


export abstract class AbstractBitrixApi {
    abstract domain: string;

    abstract init(portal: IPortal):  Promise<void> | void;
    // abstract initAuthApi?(portal: IPortal): Promise<void>;

    abstract call<T = any>(method: string, data: Record<string, any>): Promise<T>;

    abstract callType<
      NAMESPACE extends keyof BXApiSchema,
      ENTITY extends keyof BXApiSchema[NAMESPACE],
      METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY],
    >(
      namespace: NAMESPACE,
      entity: ENTITY,
      method: METHOD,
      data: TBXRequest<NAMESPACE, ENTITY, METHOD>,
    ): Promise<IBitrixResponse<TBXResponse<NAMESPACE, ENTITY, METHOD>>>;

    abstract callBatch(commands: Record<string, any>): Promise<any>;

    // abstract logger: Logger;
    abstract apiKey: string;
    abstract cmdBatch: Record<string, any>;
    // abstract semaphore: Semaphore;
    abstract axiosOptions: any;
    abstract telegramBot: TelegramService;
    abstract httpService: HttpService;
    abstract dictToQueryString: (method: string, data: Record<string, any>) => string;
    abstract addCmdBatch: (cmd: string, method: string, query: Record<string, any>) => void;
    abstract addCmdBatchType: <NAMESPACE extends keyof BXApiSchema, ENTITY extends keyof BXApiSchema[NAMESPACE], METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY]>(cmd: string, namespace: NAMESPACE, entity: ENTITY, method: METHOD, data: TBXRequest<NAMESPACE, ENTITY, METHOD>) => void;
    abstract handleBatchErrors: (result: IBitrixBatchResponseResult, context?: string) => Promise<void>;
    abstract sleep: (ms: number) => Promise<void>;


    abstract getCmdBatch: () => Record<string, string>;
    abstract callBatchAsync: () => Promise<IBitrixBatchResponseResult[]>;
    abstract callBatchWithConcurrency: (limit?: number) => Promise<IBitrixBatchResponseResult[]>;
    abstract executeBatch: (batch: [string, string][]) => Promise<IBitrixBatchResponseResult>;
    abstract clearResult: (result: IBitrixBatchResponseResult[]) => any[];
  }
  export abstract class BitrixBaseApi {
    abstract domain: string;

    abstract init?(portal: IPortal): Promise<void> | void;
    // abstract initAuthApi?(portal: IPortal): Promise<void>;

    abstract call<T = any>(method: string, data: Record<string, any>): Promise<T>;

    abstract callType<
        NAMESPACE extends keyof BXApiSchema,
        ENTITY extends keyof BXApiSchema[NAMESPACE],
        METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY],
    >(
        namespace: NAMESPACE,
        entity: ENTITY,
        method: METHOD,
        data: TBXRequest<NAMESPACE, ENTITY, METHOD>,
    ): Promise<IBitrixResponse<TBXResponse<NAMESPACE, ENTITY, METHOD>>>;

    abstract callBatch(commands: Record<string, any>): Promise<any>;


    abstract addCmdBatch: (cmd: string, method: string, query: Record<string, any>) => void;
    abstract addCmdBatchType: <NAMESPACE extends keyof BXApiSchema, ENTITY extends keyof BXApiSchema[NAMESPACE], METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY]>(cmd: string, namespace: NAMESPACE, entity: ENTITY, method: METHOD, data: TBXRequest<NAMESPACE, ENTITY, METHOD>) => void;

    abstract getCmdBatch: () => Record<string, string>;

    abstract callBatchAsync: () => Promise<IBitrixBatchResponseResult[]>;
    abstract callBatchWithConcurrency: (limit?: number) => Promise<IBitrixBatchResponseResult[]>;

}
