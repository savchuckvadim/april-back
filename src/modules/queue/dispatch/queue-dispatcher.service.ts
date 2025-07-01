// modules/queue/queue-dispatcher.service.ts
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { QueueNames } from '../constants/queue-names.enum';
import { SilentJobHandlerId } from 'src/core/silence/constants/silent-job-handlers.enum';
import { TranscribeJobHandlerId } from '../constants/transcribe-job-handler-id.enum';
import { JobNames } from '../constants/job-names.enum';

@Injectable()
export class QueueDispatcherService {
  private readonly logger = new Logger(QueueDispatcherService.name);

  constructor(
    @InjectQueue(QueueNames.EVENT) private readonly eventQueue: Queue,
    @InjectQueue(QueueNames.DOCUMENT) private readonly documentQueue: Queue,
    @InjectQueue(QueueNames.SILENT) private readonly silentQueue: Queue,
    @InjectQueue(QueueNames.SALES_KPI_REPORT) private readonly salesKpiReportQueue: Queue,
    @InjectQueue(QueueNames.TRANSCRIBE_AUDIO) private readonly transcribeAudioQueue: Queue,
    @InjectQueue(QueueNames.SERVICE_DEALS_SCHEDULE) private readonly serviceDealsScheduleQueue: Queue,
    @InjectQueue(QueueNames.SERVICE_DEALS) private readonly serviceDealsQueue: Queue,
  ) {
    this.logger.log('QueueDispatcherService initialized');
  }

  async dispatch(queueName: QueueNames, jobName: SilentJobHandlerId | TranscribeJobHandlerId | JobNames, data: any) {
    const queue = this.getQueue(queueName);
    this.logger.log(`Dispatching job ${jobName} to queue ${queueName}`);
    this.logger.log(`Job data: ${JSON.stringify(data)}`);
    await queue.add(jobName, data);
    this.logger.log('Job added to queue');
  }

  getQueue(name: QueueNames): Queue {
    this.logger.log(`Getting queue: ${name}`);
    switch (name) {
      case QueueNames.EVENT:
        return this.eventQueue;
      case QueueNames.DOCUMENT:
        return this.documentQueue;
      case QueueNames.SILENT:
        return this.silentQueue;
      case QueueNames.SALES_KPI_REPORT:
        return this.salesKpiReportQueue;
      case QueueNames.TRANSCRIBE_AUDIO:
        return this.transcribeAudioQueue;
      case QueueNames.SERVICE_DEALS_SCHEDULE:
        return this.serviceDealsScheduleQueue;
      case QueueNames.SERVICE_DEALS:
        return this.serviceDealsQueue;

      default:
        const error = `Unknown queue name: ${name}`;
        this.logger.error(error);
        throw new Error(error);
    }
  }
}
