// // modules/alfa/services/bitrix-activity-create.service.ts
// import { Injectable } from '@nestjs/common';
// import * as dayjs from 'dayjs';
// import { BitrixApiService } from 'src/modules/bitrix/api/bitrix-api.service';
// import { RedisService } from 'src/core/redis/redis.service';
// import { AlfaActivityData } from './alfa-activity.service';


// @Injectable()
// export class BitrixActivityCreateService {
//     constructor(private readonly bitrixApi: BitrixApiService, private readonly redisService: RedisService) { }

//     async createActivities(domain: string, activities: Record<string, AlfaActivityData>) {

//         if (!activities || Object.keys(activities).length === 0) return;

//         this.bitrixApi.init();


//         for (const [_, params] of Object.entries(activities)) {
//             try {
//                 console.log('params');
//                 console.log(params);
//                 const responsibleId = params.responsible?.split('_')[1];
//                 this.bitrixApi.addCmdBatch(`add_activity_${params.companyId}`, 'crm.activity.add', {
//                     fields: {
//                         OWNER_TYPE_ID: 4,
//                         OWNER_ID: params.companyId,
//                         TYPE_ID: 1,
//                         SUBJECT: params.title,
//                         RESPONSIBLE_ID: responsibleId,
//                         START_TIME: dayjs().toISOString(),
//                         END_TIME: params.date,
//                         COMMUNICATIONS: [
//                             {
//                                 VALUE: 'Компания:',
//                                 ENTITY_ID: params.companyId,
//                                 ENTITY_TYPE_ID: 4,
//                                 TYPE_ID: 1,
//                             },
//                         ],
//                     },
//                 });
//             } catch (e) {
//                 console.error(`Ошибка: ${JSON.stringify(params)}`);
//             }
//         }

//         const result = await this.bitrixApi.callBatchAsync();
//         console.log('result');
//         console.log(result);

//     }
// }
