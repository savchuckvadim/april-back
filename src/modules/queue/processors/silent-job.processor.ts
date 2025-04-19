import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { SilentJobManagerService } from 'src/core/silence/silent-job-manager.service';
import { QueueNames } from '../constants/queue-names.enum';
import { HandlerMap, SilentJobHandlersRegistry } from 'src/core/silence/silent-job-handlers.registry';
import { SilentJobHandlerId } from 'src/core/silence/constants/silent-job-handlers.enum';

@Injectable()
@Processor(QueueNames.SILENT)
export class SilentJobProcessor {
  private readonly logger = new Logger(SilentJobProcessor.name);

  constructor(
    private readonly silentManager: SilentJobManagerService,
    private readonly registry: SilentJobHandlersRegistry,
  ) {
    this.logger.log('SilentJobProcessor initialized');
    this.logger.log(`Registry available: ${!!this.registry}`);
  }

  @Process('*') // ловим все джобы
  async handle<T extends keyof HandlerMap>(job: Job<{ key: string; handlerId: T; payload: HandlerMap[T]['payload'] }>) {
    const { key, handlerId, payload } = job.data;

    this.logger.log(`Processing job with handlerId: ${handlerId}`);
    this.logger.log(`Registry available: ${!!this.registry}`);

    await this.silentManager.waitUntilSilent(`${key}_lock`);
    const collected = await this.silentManager.collectAndClear<HandlerMap[T]['collected'][string]>(key);

    const typedHandlerId = handlerId as SilentJobHandlerId; // 👈 Явно привели к enum
    const handler = this.registry.getHandler(typedHandlerId);

    this.logger.log(`Handler found: ${!!handler}`);

    if (!handler) {
      this.logger.error(`No handler found for ${handlerId}`);
      return;
    }

    await handler(collected, payload);
  }
}
