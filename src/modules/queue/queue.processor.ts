// import { Processor, Process } from '@nestjs/bull';
// import { Job } from 'bull';
// import { Injectable } from '@nestjs/common';
// import { BitrixActivityCreateService } from '../bitrix/infrastructure/services/activity/activity-create.service';
// import { RedisService } from 'src/core/redis/redis.service';


// @Processor('activity')
// @Injectable()
// export class QueueProcessor {
//     constructor(private readonly bitrixService: BitrixActivityCreateService, private readonly redisService: RedisService) { }

//     @Process('createActivity')
//     async handleCreateActivity(job: Job<{ domain: string }>) {
//         const domain = job.data.domain;
//         const redis = this.redisService.getClient();

//         while (true) {
//             const isSilent = !(await redis.exists('GO_alfa_lock'));

//             if (isSilent) {
//                 await this.bitrixService.createActivities(domain);
//                 await redis.del('GO_alfa_job_started');
//                 break;
//             }

//             await new Promise((resolve) => setTimeout(resolve, 500)); // ждем полсекунды
//         }
//     }

//     // @Process('createActivity')
//     // async handleCreateActivity(job: Job) {


//     //     // console.log('Processing queue job...');
//     //     // console.log('Processing queue data:');
//     //     // console.log(job.data);
//     //     const domain = job.data.domain;

//     //     await this.bitrixService.createActivities(domain);
//     // }
// } 