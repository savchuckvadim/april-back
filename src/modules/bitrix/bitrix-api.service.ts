import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as https from 'https';
import * as http from 'http';
import { TelegramService } from '../telegram/telegram.service';
import { AxiosResponse } from 'axios';

@Injectable()
export class BitrixApiService {
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
    this.domain = '';
    this.apiKey = '';
    this.semaphore = new Semaphore(10);
    this.axiosOptions = {
      timeout: 5000,
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
    };
  }

  init(
    // domain: string, apiKey: string
  ) {
    this.domain = this.configService.get('BITRIX_DOMAIN') as string;
    this.apiKey = this.configService.get('BITRIX_KEY') as string;
    this.cmdBatch = {};
  }

  private dictToQueryString(method: string, data: Record<string, any>): string {
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

    return `${method}?${queryParts.join('&')}`;
  }

  addCmdBatch(cmd: string, method: string, query: Record<string, any>) {
    const url = this.dictToQueryString(method, query);
    if (!this.cmdBatch[cmd]) {
      this.cmdBatch[cmd] = url;
    }
  }

  async call(method: string, data: Record<string, any>): Promise<any> {
    const url = `https://${this.domain}/${this.apiKey}/${method}`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, data, this.axiosOptions),
      );
      return response.data;
    } catch (error) {
      await this.telegramBot.sendMessageAdminError(`Bitrix call error: ${JSON.stringify(error?.response?.data || error)}`);
      throw error;
    }
  }

  async callBatch(): Promise<any[]> {
    const results = [] as string[];
    const commands = Object.entries(this.cmdBatch);

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
        const response: AxiosResponse<any> = await firstValueFrom(
          this.httpService.post(url, batchPayload, this.axiosOptions),
        );
        results.push(response.data.result);
      } catch (error) {
        await this.telegramBot.sendMessageAdminError(`Batch error: ${JSON.stringify(error?.response?.data || error)}`);
        results.push(error);
      }
    }

    this.cmdBatch = {};
    return results;
  }

  async callBatchAsync(): Promise<any[]> {
    const commands = Object.entries(this.cmdBatch);
    console.log('[Bitrix] callBatchAsync called');
    console.log(commands);
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
    const cmd: Record<string, string> = {};
    for (const [key, val] of batch) {
      cmd[key] = val;
    }

    const payload = { halt: 0, cmd };
    const url = `https://${this.domain}/${this.apiKey}/batch`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, this.axiosOptions),
      );
      return response.data.result;
    } catch (error) {
      await this.telegramBot.sendMessageAdminError(`Execute batch failed: ${JSON.stringify(error?.response?.data || error)}`);
      return error;
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
