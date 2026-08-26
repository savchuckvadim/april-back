import { Module } from '@nestjs/common';
import { TelegramModule } from '@lib/telegram/telegram.module';
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
    // Endpoint-сервис экспортируется для внутренних постановок холодного
    // звонка (реанимация отказников) — минуя HTTP-контроллер.
    exports: [ColdHooksHandlerService, ColdHookSilinceEndpointService],
})
export class ColdHookModule {}
