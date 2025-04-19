// // modules/bitrix/bitrix.service.ts
// import { Injectable } from '@nestjs/common';
// import * as dayjs from 'dayjs';
// import { BitrixApiService } from 'src/modules/bitrix/api/bitrix-api.service';
// import { RedisService } from 'src/core/redis/redis.service';

// interface ActivityParams {
//     companyId: number;
//     title: string;
//     date: string;
//     responsible: string;
// }


// @Injectable()
// export class BitrixActivityCreateService {
//     constructor(private readonly bitrixApi: BitrixApiService, private readonly redisService: RedisService) { }

//     async createActivities(domain: string) {
//         // console.log('createActivities');
//         // console.log(domain);
//         const redis = this.redisService.getClient();
//         let key = 'GO_alfa';
//         let raw;

//         // const lockKey = 'GO_alfa_lock';
//         try {



//             raw = await redis.get(key);
//         } catch (e) {
//             console.error('[Redis] Ошибка при работе с Redis:', e);
//         }
//         console.log('raw');
//         console.log(raw);

//         if (!raw) return;

//         const data: Record<string, ActivityParams> = JSON.parse(raw);
//         await redis.del(key);
//         // await redis.del(lockKey);

//         // Инициализация Bitrix API
//         this.bitrixApi.init();

//         for (const [_, params] of Object.entries(data)) {
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
