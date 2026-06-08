import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from 'src/core/redis/redis.module';
import { PortalService } from './portal.service';
import { PortalContextService } from './services/portal-context.service';
import { APIOnlineClient } from '@lib/online/client/api-online.client';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { PortalModelFactory } from './factory/potal-model.factory';
import { OnlineClientModule } from '@lib/online';

@Module({
    imports: [HttpModule, RedisModule, TelegramModule, OnlineClientModule],
    providers: [
        PortalService, //for standalone queue etc
        PortalContextService, //from request
        PortalModelFactory,
        APIOnlineClient,
    ],
    exports: [
        PortalService, //for standalone queue etc
        PortalContextService, //from request

        PortalModelFactory,
    ],
})
export class PortalModule {}
