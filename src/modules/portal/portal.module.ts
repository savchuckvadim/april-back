import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from 'src/core/redis/redis.module';
import { PortalService } from './portal.service';
import { PortalContextService } from './services/portal-context.service';
import { PortalContextMiddleware } from './middleware/portal-context.middleware';
import { APIOnlineClient } from '../../clients/api-online.client';

// import { ClientsModule } from 'src/clients/clients.module';
import { TelegramModule } from 'src/modules/telegram/telegram.module';
import { PortalModelFactory } from './factory/potal-model.factory';
import { KpiReportController } from 'src/apps/kpi-report/kpi-report.controller';
import { DepartmentController } from '../bitrix/endpoints/department/department.controller';
import { AlfaController } from 'src/apps/alfa/alfa.controller';
import { ListController } from '../bitrix/endpoints/list/bx-list-endpoint.controller';


// C:\Projects\April-KP\april-next\back\src\modules\portal\portal.module.ts
@Module({
    imports: [
        HttpModule,
        RedisModule,
        // ClientsModule,
        TelegramModule
    ],
    providers: [
        PortalService,  //for standalone queue etc
        PortalContextService, //from request

        PortalModelFactory,
        APIOnlineClient
    ],
    exports: [
        PortalService, //for standalone queue etc
        PortalContextService, //from request

        PortalModelFactory
    ]
})
export class PortalModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(PortalContextMiddleware)
            .exclude({ path: '/queue/ping', method: RequestMethod.ALL })
            .exclude('/hooks/*path')  // не кладём portal
            .exclude('/kpi-report/download')  // не кладём portal
            .exclude('api/queue/ping')  // не кладём portal
            .forRoutes(
                KpiReportController,
                DepartmentController,
                AlfaController,
                ListController
            )
        // .forRoutes({ path: '*', method: RequestMethod.ALL });

        // .forRoutes({ path: 'api/*path', method: RequestMethod.ALL });
    }
}



// PortalService	Получает портал (с кэшем в Redis)
// PortalModelFactory + PortalModel	Доступ к методам портала
// PortalContextService	Только для scope: REQUEST, хранит portal
// PortalContextMiddleware	Парсит domain и кладёт в context