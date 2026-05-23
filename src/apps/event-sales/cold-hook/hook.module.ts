import { Module } from '@nestjs/common';
import { TelegramModule } from '@/modules/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { EventSalesHookController } from './controllers/hook.controller';
import { ColdHookSilinceEndpointService } from './services/silence/cold-hook-silince-endpoint.service';
import { ColdHooksHandlerService } from './services/silence/cold-hooks-handler.service';
import { EventSilenceModule } from '@/core';

@Module({
    imports: [EventSilenceModule, PBXModule, TelegramModule, HttpModule],
    controllers: [EventSalesHookController],
    providers: [ColdHookSilinceEndpointService, ColdHooksHandlerService],
})
export class EventSalesHookModule {}
