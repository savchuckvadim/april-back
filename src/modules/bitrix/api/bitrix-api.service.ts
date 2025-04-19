import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as https from 'https';
import * as http from 'http';
import { TelegramService } from '../../telegram/telegram.service';
import { AxiosResponse } from 'axios';
import { IPortal } from '../../portal/interfaces/portal.interface';

@Injectable()
export class BitrixApiService {
  private readonly logger = new Logger(BitrixApiService.name);
  private domain: string;
  private apiKey: string;
  private cmdBatch: Record<string, string> = {};
  private semaphore: Semaphore;
  private axiosOptions: any;

  constructor(
    private readonly telegramBot: TelegramService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.logger.log('BitrixApiService initialized');
    this.domain = '';
    this.apiKey = '';
    this.semaphore = new Semaphore(10);
    this.axiosOptions = {
      timeout: 5000,
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
    };
  }

  init() {
    this.logger.log('Initializing BitrixApi from config');
    this.domain = this.configService.get('BITRIX_DOMAIN') as string;
    this.apiKey = this.configService.get('BITRIX_KEY') as string;
    this.cmdBatch = {};
    this.logger.log(`Domain: ${this.domain}`);
  }

  initFromPortal(portal: IPortal) {
    this.logger.log(`Initializing BitrixApi from portal: ${portal.domain}`);
    this.domain = portal.domain;
    this.apiKey = portal.C_REST_WEB_HOOK_URL;
    this.cmdBatch = {};
  }

  private dictToQueryString(method: string, data: Record<string, any>): string {
    this.logger.log(`Converting data to query string for method: ${method}`);
    const queryParts: string[] = [];

    const processItem = (key: string, value: any) => {
      key = key.trim();
      if (typeof value === 'object' && !Array.isArray(value)) {
        for (const [subKey, subValue] of Object.entries(value)) {
          processItem(`${key}[${subKey.trim()}]`, subValue);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            for (const [subKey, subValue] of Object.entries(item)) {
              processItem(`${key}[${index}][${subKey.trim()}]`, subValue);
            }
          } else {
            queryParts.push(`${key}[]=${item}`);
          }
        });
      } else {
        queryParts.push(`${key}=${value}`);
      }
    };

    for (const [key, value] of Object.entries(data)) {
      processItem(key, value);
    }

    const queryString = `${method}?${queryParts.join('&')}`;
    this.logger.log(`Generated query string: ${queryString}`);
    return queryString;
  }

  addCmdBatch(cmd: string, method: string, query: Record<string, any>) {
    this.logger.log(`Adding command to batch: ${cmd}`);
    this.logger.log(`Method: ${method}`);
    this.logger.log(`Query: ${JSON.stringify(query)}`);
    const url = this.dictToQueryString(method, query);
    if (!this.cmdBatch[cmd]) {
      this.cmdBatch[cmd] = url;
    }
  }

  async call(method: string, data: Record<string, any>): Promise<any> {
    this.logger.log(`Making API call to method: ${method}`);
    this.logger.log(`Data: ${JSON.stringify(data)}`);
    const url = `https://${this.domain}/${this.apiKey}/${method}`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, data, this.axiosOptions),
      );
      this.logger.log(`API call successful: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(`API call failed: ${error.message}`);
      await this.telegramBot.sendMessageAdminError(`Bitrix call error: ${JSON.stringify(error?.response?.data || error)}`);
      throw error;
    }
  }

  async callBatch(): Promise<any[]> {
    this.logger.log('Calling batch');
    const results = [] as string[];
    const commands = Object.entries(this.cmdBatch);
    this.logger.log(`Number of commands: ${commands.length}`);

    for (let i = 0; i < commands.length; i += 50) {
      const batch = commands.slice(i, i + 50);
      const cmd: Record<string, string> = {};
      for (const [key, val] of batch) {
        cmd[key] = val;
      }

      const batchPayload = {
        halt: 0,
        cmd,
      };

      const url = `https://${this.domain}/${this.apiKey}/batch`;
      try {
        this.logger.log(`Making batch request to: ${url}`);
        const response: AxiosResponse<any> = await firstValueFrom(
          this.httpService.post(url, batchPayload, this.axiosOptions),
        );
        this.logger.log(`Batch request successful: ${JSON.stringify(response.data)}`);
        results.push(response.data.result);
      } catch (error) {
        this.logger.error(`Batch request failed: ${error.message}`);
        await this.telegramBot.sendMessageAdminError(`Batch error: ${JSON.stringify(error?.response?.data || error)}`);
        results.push(error);
      }
    }

    this.cmdBatch = {};
    return results;
  }

  async callBatchAsync(): Promise<any[]> {
    this.logger.log('Calling batch async');
    const commands = Object.entries(this.cmdBatch);
    this.logger.log(`Number of commands: ${commands.length}`);
    this.logger.log(`Commands: ${JSON.stringify(commands)}`);
    const tasks: Promise<any>[] = [];

    for (let i = 0; i < commands.length; i += 50) {
      const batch = commands.slice(i, i + 50);
      tasks.push(this.executeBatch(batch));
    }

    const results = await Promise.all(tasks);
    this.cmdBatch = {};
    return results;
  }

  private async executeBatch(batch: [string, string][]) {
    this.logger.log(`Executing batch of ${batch.length} commands`);
    const cmd: Record<string, string> = {};
    for (const [key, val] of batch) {
      cmd[key] = val;
    }

    const payload = { halt: 0, cmd };
    const url = `https://${this.domain}/${this.apiKey}/batch`;

    try {
      this.logger.log(`Making batch request to: ${url}`);
      const response = await firstValueFrom(
        this.httpService.post(url, payload, this.axiosOptions),
      );

      const result = response.data.result;
      this.logger.log(`Batch request successful: ${JSON.stringify(result)}`);
      await this.handleBatchErrors(response.data, 'executeBatch');
      return result;
    } catch (error) {
      const msg = error?.response?.data || error;
      this.logger.error(`Execute batch failed: ${JSON.stringify(msg)}`);
      await this.telegramBot.sendMessageAdminError(
        `Execute batch failed: ${JSON.stringify(msg)}`
      );
      return error;
    }
  }

  private async handleBatchErrors(result: any, context = 'Batch error'): Promise<void> {
    if (!result?.result_error) return;

    const errorEntries = Object.entries(result.result_error);
    for (const [key, error] of errorEntries) {
      const message = `[${context}] Ошибка в ${key}: ${JSON.stringify(error)}`;
      this.logger.error(message);
      await this.telegramBot.sendMessageAdminError(message);
    }
  }
}

// Вспомогательный семафор
class Semaphore {
  private semaphore: number;
  private waiting: Array<() => void> = [];

  constructor(count: number) {
    this.semaphore = count;
  }

  async acquire(): Promise<void> {
    if (this.semaphore > 0) {
      this.semaphore -= 1;
    } else {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
  }

  release(): void {
    this.semaphore += 1;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      next?.();
    }
  }
}
