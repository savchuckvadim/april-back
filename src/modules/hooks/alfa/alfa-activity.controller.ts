// modules/hooks/hooks.controller.ts

import {
  Controller, Post, Req, Query, Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { SilentJobHandlerId } from 'src/core/silence/constants/silent-job-handlers.enum';
import { SilentJobManagerService } from 'src/core/silence/silent-job-manager.service';
// import { QueueDispatcherService } from 'src/modules/queue/dispatch/queue-dispatcher.service';


@Controller('hooks/alfa')
export class AlfaHookController {
  private readonly logger = new Logger(AlfaHookController.name);

  constructor(
    // private readonly queueDispatcher: QueueDispatcherService,

    private readonly silentManager: SilentJobManagerService
  ) {
    this.logger.log('AlfaHookController initialized');
  }


  @Post('activity')
  async handleActivity(@Req() req: Request, @Query() query: any) {
    this.logger.log('handleActivity called');
    // this.logger.log(`Request body: ${JSON.stringify(req.body)}`);
    // this.logger.log(`Request query: ${JSON.stringify(query)}`);
    const domain = req.body?.auth?.domain;
    this.logger.log(`Extracted domain: ${domain}`);
    const data = {
      companyId: Number(query.companyId),
      title: query.title,
      date: query.date,
      responsible: query.responsible,
    };
    // this.logger.log(`Activity data: ${JSON.stringify(data)}`);
    // this.logger.log(`Domain: ${domain}`);
    const domainKey = domain.replace(/\./g, '_'); // чтобы точки не мешались в ключе
    await this.silentManager.handle(
      `GO_alfa_${domainKey}_${data.responsible}`,
      1500,
      data,
      // this.queueDispatcher.getQueue(QueueNames.SILENT),
      SilentJobHandlerId.CREATE_ACTIVITY,
      { domain },
    );

    return { result: true };
  }
}



// [Bitrix Webhook POST]
//    ⬇
// /api/hooks/alfa/activity   ← (Controller)
//    ⬇
// HooksController.handleActivity()
//    ⬇
// SilentJobManagerService.handle()              ← Сохраняем данные в Redis и ставим задачу
//    ⬇
// QueueDispatcherService.getQueue('SILENT')     ← Берём очередь для "тихой" задачи
//    ⬇
// bull: очередь 'silent'                        ← Задача с handlerId и payload отправлена
//    ⬇
// SilentJobProcessor.handle()                   ← Ждём тишину, собираем данные
//    ⬇
// SilentJobHandlersRegistry.getHandler(handlerId) ← Находим зарегистрированный обработчик
//    ⬇
// BitrixActivityCreateService.createActivities()
//    ⬇
// BitrixApiService.addCmdBatch()
//    ⬇
// BitrixApiService.callBatchAsync()