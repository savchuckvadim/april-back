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
import { PortalProviderService } from './services/portal-provider.service';
import { PortalModelFactory } from './factory/potal-model.factory';
import { KpiReportController } from 'src/apps/kpi-report/kpi-report.controller';
import { DepartmentController } from '../bitrix/endpoints/department/department.controller';

// C:\Projects\April-KP\april-next\back\src\modules\portal\portal.module.ts
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
        PortalProviderService,
        PortalModelFactory,
        APIOnlineClient
    ],
    exports: [
        PortalService,
        PortalContextService,
        PortalProviderService,
        PortalModelFactory
    ]
})
export class PortalModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(PortalContextMiddleware)
            .exclude({ path: '/api/queue/ping', method: RequestMethod.ALL })
            .exclude('/hooks/*path')  // не кладём portal
            .exclude('api/queue/ping')  // не кладём portal
            .forRoutes(KpiReportController, DepartmentController)
        // .forRoutes({ path: '*', method: RequestMethod.ALL });

        // .forRoutes({ path: 'api/*path', method: RequestMethod.ALL });
    }
}



// PortalService	Получает портал (с кэшем в Redis)
// PortalModelFactory + PortalModel	Доступ к методам портала
// PortalProviderService	Обёртка, работает с domain → model
// PortalContextService	Только для scope: REQUEST, хранит portal
// PortalContextMiddleware	Парсит domain и кладёт в context