import { Module } from '@nestjs/common';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { EventSalesHookV2Controller } from './controllers/hook.controller';
import { ColdHookSilinceEndpointV2Service } from './services/silence/cold-hook-silince-endpoint.service';
import { ColdHooksHandlerV2Service } from './services/silence/cold-hooks-handler.service';
import { EventSilenceModule } from '@/core';

@Module({
    imports: [EventSilenceModule, PBXModule, TelegramModule, HttpModule],
    controllers: [EventSalesHookV2Controller],
    providers: [ColdHookSilinceEndpointV2Service, ColdHooksHandlerV2Service],
    // Endpoint-сервис экспортируется для внутренних постановок холодного
    // звонка (реанимация отказников) — минуя HTTP-контроллер.
    exports: [ColdHooksHandlerV2Service, ColdHookSilinceEndpointV2Service],
})
export class ColdHookV2Module {}
