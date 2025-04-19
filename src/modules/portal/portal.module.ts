import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from 'src/core/redis/redis.module';
import { PortalService } from './portal.service';
import { PortalContextService } from './services/portal-context.service';
import { PortalContextMiddleware } from './middleware/portal-context.middleware';
import { APIOnlineClient } from '../../clients/api-online.client';
import { PortalModel } from './services/portal.model';
// import { ClientsModule } from 'src/clients/clients.module';
import { TelegramModule } from 'src/modules/telegram/telegram.module';

@Module({
    imports: [
        HttpModule,
        RedisModule,
        // ClientsModule,
        TelegramModule
    ],
    providers: [
        PortalService,
        PortalContextService,
        PortalContextMiddleware,
        APIOnlineClient,
        PortalModel
    ],
    exports: [
        PortalService,
        PortalContextService,
        PortalModel
    ]
})
export class PortalModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(PortalContextMiddleware)
            .forRoutes({ path: '*', method: RequestMethod.ALL });

            // .forRoutes({ path: 'api/*path', method: RequestMethod.ALL });
    }
} 