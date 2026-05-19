// // modules/hooks/hooks.controller.ts

// import { Controller, Post, Query, Logger, Body } from '@nestjs/common';
// import { AlfaActivityHookService } from './services/alfa-activity-hook.service';
// import { ApiProperty, ApiTags } from '@nestjs/swagger';
// import { IsString } from 'class-validator';
// import { BxWebHookDto } from '@/apps/ork-documents/act/ork-act.dto';

// export class AlfaActivityQueryDto {
//     @ApiProperty({ example: 'company id' })
//     @IsString()
//     companyId: string;

//     @ApiProperty({ example: 'something' })
//     @IsString()
//     title: string;

//     @ApiProperty({ example: 'something' })
//     @IsString()
//     date: string;

//     @ApiProperty({ example: 'something' })
//     @IsString()
//     responsible: string;
// }

// @ApiTags('Alfa Activity hooks')
// @Controller('hooks/alfa')
// export class AlfaHookController {
//     private readonly logger = new Logger(AlfaHookController.name);

//     constructor(
//         private readonly alfaActivityHookService: AlfaActivityHookService,
//     ) {
//         this.logger.log('AlfaHookController initialized');
//     }

//     @Post('activity')
//     async handleActivity(
//         @Body() body: BxWebHookDto,
//         @Query() query: AlfaActivityQueryDto,
//     ) {
//         this.logger.log('handleActivity called');
//         const domain = body.auth.domain;
//         this.logger.log(`Extracted domain: ${domain}`);
//         await this.alfaActivityHookService.createActivityHook(
//             domain,
//             query.companyId,
//             query.title,
//             query.date,
//             query.responsible,
//         );
//         return { result: true };
//     }
// }

// // [Bitrix Webhook POST]
// //    ⬇
// // /api/hooks/alfa/activity   ← (Controller)
// //    ⬇
// // HooksController.handleActivity()
// //    ⬇
// // SilentJobManagerService.handle()              ← Сохраняем данные в Redis и ставим задачу
// //    ⬇
// // QueueDispatcherService.getQueue('SILENT')     ← Берём очередь для "тихой" задачи
// //    ⬇
// // bull: очередь 'silent'                        ← Задача с handlerId и payload отправлена
// //    ⬇
// // SilentJobProcessor.handle()                   ← Ждём тишину, собираем данные
// //    ⬇
// // SilentJobHandlersRegistry.getHandler(handlerId) ← Находим зарегистрированный обработчик
// //    ⬇
// // BitrixActivityCreateService.createActivities()
// //    ⬇
// // BitrixApiService.addCmdBatch()
// //    ⬇
// // BitrixApiService.callBatchAsync()
