import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Injectable } from '@nestjs/common';

@Injectable()
export class QueueService {
    constructor(@InjectQueue('activity') private readonly activityQueue: Queue) { }

    async addActivityJob(data: any) {
        console.log('addActivityJob');
        console.log(data);

        //
        await this.activityQueue.add('createActivity', data, {
            // delay: 2000,
            removeOnComplete: true,
            removeOnFail: true,
        });
    }
} 