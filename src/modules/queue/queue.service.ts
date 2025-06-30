// import { InjectQueue } from '@nestjs/bull';
// import { Queue } from 'bull';
// import { Injectable, Logger } from '@nestjs/common';
// import { QueueNames } from './constants/queue-names.enum';

// @Injectable()
// export class QueueService {
//     private readonly logger = new Logger(QueueService.name);

//     constructor(@InjectQueue(QueueNames.ACTIVITY) private readonly activityQueue: Queue) {
//         this.logger.log('QueueService initialized');
//     }

//     async addActivityJob(data: any) {
//         this.logger.log('Adding activity job');
//         this.logger.log(`Job data: ${JSON.stringify(data)}`);

//         await this.activityQueue.add('createActivity', data, {
//             removeOnComplete: true,
//             removeOnFail: true,
//         });
//         this.logger.log('Activity job added to queue');
//     }
// } 