import { Injectable, Optional, Scope } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { TelegramService } from '../../../telegram/telegram.service';
import { PortalContextService } from 'src/modules/portal/services/portal-context.service';
import { BitrixBaseApi } from '../base/bitrix-base-api';



@Injectable({ scope: Scope.REQUEST })
export class BitrixRequestApiService extends BitrixBaseApi {
  constructor(
    telegram: TelegramService,
    http: HttpService,
    @Optional() private readonly portalContext?: PortalContextService
  ) {
    super(telegram, http);

    if (this.portalContext) {
      const portal = this.portalContext.getPortal();
      if (portal) this.initFromPortal(portal);
    }
  }
}


// @Injectable({ scope: Scope.REQUEST })
// export class BitrixApiService {
//   private readonly logger = new Logger(BitrixApiService.name);
//   public domain: string;
//   private apiKey: string;
//   private cmdBatch: Record<string, string> = {};
//   private semaphore: Semaphore;
//   private axiosOptions: any;

//   constructor(
//     private readonly telegramBot: TelegramService,
//     private readonly httpService: HttpService,
//     @Optional() private readonly portalContext?: PortalContextService // из реквеста приходит из очередей не приходит
//   ) {
//     this.logger.log('BitrixApiService initialized');
//     this.domain = '';
//     this.apiKey = '';
//     this.semaphore = new Semaphore(10);
//     this.axiosOptions = {
//       timeout: 25000,
//       httpAgent: new http.Agent({ keepAlive: true }),
//       httpsAgent: new https.Agent({ keepAlive: true }),
//     };


//     if (this.portalContext) {  // если мы в реквесте - автоматически инициилизируемся из portal contexta
//       Logger.log('this.portalContext')

//       const portal = this.portalContext.getPortal();
//       if (portal) {
//         this.initFromPortal(portal);
//       }else{
//         Logger.log('BitrixApiService this.portalContext no portal')
//       }

//     }
//     //если нет - нас проинициализируют из воркера через bx api factory-> init from portal
//   }



//   initFromPortal(portal: IPortal) {
//     this.logger.log(`Initializing BitrixApi from portal: ${portal.domain}`);
//     this.domain = portal.domain;
//     this.apiKey = portal.C_REST_WEB_HOOK_URL;
//     this.cmdBatch = {};
//   }

//   private dictToQueryString(method: string, data: Record<string, any>): string {
//     // this.logger.log(`Converting data to query string for method: ${method}`);
//     const queryParts: string[] = [];

//     const processItem = (key: string, value: any) => {
//       key = key.trim();
//       if (typeof value === 'object' && !Array.isArray(value)) {
//         for (const [subKey, subValue] of Object.entries(value)) {
//           processItem(`${key}[${subKey.trim()}]`, subValue);
//         }
//       } else if (Array.isArray(value)) {
//         value.forEach((item, index) => {
//           if (typeof item === 'object') {
//             for (const [subKey, subValue] of Object.entries(item)) {
//               processItem(`${key}[${index}][${subKey.trim()}]`, subValue);
//             }
//           } else {
//             queryParts.push(`${key}[]=${item}`);
//           }
//         });
//       } else {
//         queryParts.push(`${key}=${value}`);
//       }
//     };

//     for (const [key, value] of Object.entries(data)) {
//       processItem(key, value);
//     }

//     const queryString = `${method}?${queryParts.join('&')}`;
//     // this.logger.log(`Generated query string: ${queryString}`);
//     return queryString;
//   }

//   addCmdBatch(cmd: string, method: string, query: Record<string, any>) {
//     // this.logger.log(`Adding command to batch: ${cmd}`);
//     // this.logger.log(`Method: ${method}`);
//     // this.logger.log(`Query: ${JSON.stringify(query)}`);
//     // this.logger.log(`Domain: ${this.domain}`);
//     const url = this.dictToQueryString(method, query);
//     if (!this.cmdBatch[cmd]) {
//       this.cmdBatch[cmd] = url;
//     }
//   }

//   getCmdBatch(): Record<string, string> {
//     return this.cmdBatch;
//   }

//   async call<T>(method: string, data: Record<string, any>): Promise<any> {
//     this.logger.log(`Making API call to method: ${method}`);
//     this.logger.log(`Data: ${JSON.stringify(data)}`);
//     const url = `https://${this.domain}/${this.apiKey}/${method}`;
//     try {
//       const response = await firstValueFrom(
//         this.httpService.post(url, data, this.axiosOptions),
//       );
//       this.logger.log(`API call successful: ${JSON.stringify(response.data)}`);
//       return response.data;
//     } catch (error) {
//       this.logger.error(`API call failed: ${error.message}`);
//       await this.telegramBot.sendMessageAdminError(`Bitrix call error: ${JSON.stringify(error?.response?.data || error)}`);
//       throw error;
//     }
//   }

//   async callBatch(): Promise<any[]> {
//     // this.logger.log('Calling batch');
//     // this.logger.log(`Domain: ${this.domain}`);
//     const results = [] as string[];
//     const commands = Object.entries(this.cmdBatch);
//     // this.logger.log(`Number of commands: ${commands.length}`);

//     for (let i = 0; i < commands.length; i += 50) {
//       const batch = commands.slice(i, i + 50);
//       const cmd: Record<string, string> = {};
//       for (const [key, val] of batch) {
//         cmd[key] = val;
//       }

//       const batchPayload = {
//         halt: 0,
//         cmd,
//       };
//       if (!this.domain || !this.apiKey) {
//         this.logger.error('Domain or API key is not set');
//         await this.telegramBot.sendMessageAdminError(`
//           BitrixApiService
//           callBatch
//           Domain or API key is not set
//           `);

//       }
//       const url = `https://${this.domain}/${this.apiKey}/batch`;
//       try {
//         // this.logger.log(`Making batch request to: ${url}`);
//         const response: AxiosResponse<any> = await firstValueFrom(
//           this.httpService.post(url, batchPayload, this.axiosOptions),
//         );
//         // this.logger.log(`Batch request successful: ${JSON.stringify(response.data)}`);
//         results.push(response.data.result);
//       } catch (error) {
//         this.logger.error(`Batch request failed: ${error.message}`);
//         await this.telegramBot.sendMessageAdminError(`Batch error:
//           callBatch
//           ${this.domain}
        
//           ${JSON.stringify(error?.message)}`);
//         results.push(error);
//       }
//     }

//     this.cmdBatch = {};
//     return results;
//   }

//   async callBatchAsync(): Promise<IBitrixBatchResponseResult[]> {
//     this.logger.log('Calling batch async');
//     const commands = Object.entries(this.cmdBatch);
//     // this.logger.log(`Number of commands: ${commands.length}`);
//     // this.logger.log(`Domain: ${this.domain}`);
//     // this.logger.log(`Commands: ${JSON.stringify(commands)}`);
//     const tasks: Promise<any>[] = [];

//     for (let i = 0; i < commands.length; i += 50) {
//       const batch = commands.slice(i, i + 50);
//       tasks.push(this.executeBatch(batch));
//     }
//     this.logger.log(`length of tasks: ${tasks.length}`);

//     const results = await Promise.all(tasks);
//     this.cmdBatch = {};
//     return results;
//   }
//   async callBatchWithConcurrency(limit = 3): Promise<IBitrixBatchResponseResult[]> {
//     this.logger.log('Calling batch async with concurrency limit:', limit);

//     const commands = Object.entries(this.cmdBatch);
//     const results: IBitrixBatchResponseResult[] = [];

//     let index = 0;

//     const runBatch = async (): Promise<void> => {
//       while (index < commands.length) {
//         const start = index;
//         index += 50;
//         const batch = commands.slice(start, index);
//         const result = await this.executeBatch(batch);

//         if (result && typeof result === 'object' && 'result' in result) {
//           results.push(result);
//         } else {
//           this.logger.warn(`Skipping failed batch at index ${start}`);
//         }
//       }
//     };

//     // Запускаем до `limit` параллельных воркеров
//     await Promise.all(Array(limit).fill(0).map(() => runBatch()));

//     this.cmdBatch = {};
//     return results;
//   }

//   private async executeBatch(batch: [string, string][]) {
//     // this.logger.log(`Executing batch of ${batch.length} commands`);
//     const cmd: Record<string, string> = {};
//     for (const [key, val] of batch) {
//       cmd[key] = val;
//     }

//     const payload = { halt: 0, cmd };
//     const url = `https://${this.domain}/${this.apiKey}/batch`;

//     try {
//       this.logger.log(`Making batch request to: ${url}`);
//       const response = await firstValueFrom(
//         this.httpService.post(url, payload, this.axiosOptions),
//       ) as AxiosResponse<IBitrixBatchResponse>;

//       const result = response.data.result as IBitrixBatchResponseResult;
//       // this.logger.log(`Batch request successful: ${JSON.stringify(result)}`);
//       // this.logger.log(`Domain: ${this.domain}`);
//       const batchResultsCount = Object.keys(result.result).length;
//       this.logger.log(`Batch results count: ${batchResultsCount}`);
//       await this.handleBatchErrors(result, 'executeBatch');
//       return result;
//     } catch (error) {
//       const msg = error?.response?.data || error;
//       // this.logger.error(`Execute batch failed: ${JSON.stringify(msg)}`);
//       await this.telegramBot.sendMessageAdminError(
//         `Execute batch failed: ${JSON.stringify(error)}`
//       );
//       return error;
//     }
//   }

//   private async handleBatchErrors(result: IBitrixBatchResponseResult, context = 'Batch error'): Promise<void> {
//     if (!result?.result_error) return;
//     this.logger.log(`
//       success
//       Domain: 
//       ${this.domain}
//       `);



//     const errorEntries = Object.entries(result.result_error);
//     for (const [key, error] of errorEntries) {
//       const message = `[${context}] Ошибка в ${key}: ${JSON.stringify(error)}
      
//       Domain: ${this.domain}
//       `;
//       this.logger.log(`result_error: ${message}`);
//       await this.telegramBot.sendMessageAdminError(message);

//     }
//   }
// }

// // Вспомогательный семафор
// class Semaphore {
//   private semaphore: number;
//   private waiting: Array<() => void> = [];

//   constructor(count: number) {
//     this.semaphore = count;
//   }

//   async acquire(): Promise<void> {
//     if (this.semaphore > 0) {
//       this.semaphore -= 1;
//     } else {
//       await new Promise<void>((resolve) => this.waiting.push(resolve));
//     }
//   }

//   release(): void {
//     this.semaphore += 1;
//     if (this.waiting.length > 0) {
//       const next = this.waiting.shift();
//       next?.();
//     }
//   }
// }
