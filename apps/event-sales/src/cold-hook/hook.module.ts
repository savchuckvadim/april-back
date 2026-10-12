import { Module } from '@nestjs/common';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { EventSalesHookController } from './controllers/hook.controller';
import { ColdHookSilinceEndpointService } from './services/silence/cold-hook-silince-endpoint.service';
import { ColdHooksHandlerService } from './services/silence/cold-hooks-handler.service';
import { EventSilenceModule } from '@/core';
import { QueueModule } from '@/modules/queue/queue.module';
import { ColdHooksProcessor } from './queue/cold-hooks.processor';

@Module({
    imports: [
        EventSilenceModule,
        // Очередь окон холодного старта v1 (строго по одному окну).
        QueueModule,
        PBXModule,
        TelegramModule,
        HttpModule,
    ],
    controllers: [EventSalesHookController],
    providers: [
        ColdHookSilinceEndpointService,
        ColdHooksHandlerService,
        ColdHooksProcessor,
    ],
    // Endpoint-сервис экспортируется для внутренних постановок холодного
    // звонка (реанимация отказников) — минуя HTTP-контроллер.
    exports: [ColdHooksHandlerService, ColdHookSilinceEndpointService],
})
export class ColdHookModule {}
