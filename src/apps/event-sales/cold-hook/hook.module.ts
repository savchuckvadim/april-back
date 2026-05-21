import { Module } from '@nestjs/common';
import { TelegramModule } from '@/modules/telegram/telegram.module';
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
        PBXModule,
        TelegramModule,
        HttpModule,
        QueueModule,
    ],
    controllers: [EventSalesHookController],
    providers: [
        ColdHookSilinceEndpointService,
        ColdHooksHandlerService,
        ColdHooksProcessor,
    ],
})
export class EventSalesHookModule { }
