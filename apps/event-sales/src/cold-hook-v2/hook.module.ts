import { Module } from '@nestjs/common';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { EventSalesHookV2Controller } from './controllers/hook.controller';
import { ColdHookSilinceEndpointV2Service } from './services/silence/cold-hook-silince-endpoint.service';
import { ColdHooksHandlerV2Service } from './services/silence/cold-hooks-handler.service';
import { EventSilenceModule } from '@/core';
import { PbxPresentationSmartModule } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { PbxZprSmartModule } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { UserNameResolver } from '../shared/lead-request/user-name.resolver';

@Module({
    imports: [
        EventSilenceModule,
        PBXModule,
        TelegramModule,
        HttpModule,
        // Резолв смартов для связей клиента (v2, шаг 3).
        PbxPresentationSmartModule,
        PbxZprSmartModule,
    ],
    controllers: [EventSalesHookV2Controller],
    providers: [
        ColdHookSilinceEndpointV2Service,
        ColdHooksHandlerV2Service,
        // Имена сотрудников для записей таймлайна (кэш на домен, fail-open).
        UserNameResolver,
    ],
    // Endpoint-сервис экспортируется для внутренних постановок холодного
    // звонка (реанимация отказников) — минуя HTTP-контроллер.
    exports: [ColdHooksHandlerV2Service, ColdHookSilinceEndpointV2Service],
})
export class ColdHookV2Module {}
