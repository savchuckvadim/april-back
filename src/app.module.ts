import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueueModule } from './modules/queue/queue.module';

import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './modules/telegram/telegram.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { RedisModule } from './core/redis/redis.module';
import { SilentJobHandlersModule } from './core/silence/silent-job-handlers.module';
import { KpiReportModule } from './apps/kpi-report/kpi-report.module';
import { EventSalesModule } from './apps/event-sales/event.module';
import { GsrModule } from './commands/excel-migrate/gsr.module';
import { HealthController } from './health.controller';
import { PBXModule } from './modules/pbx/pbx.module';
import { WsModule } from './core/ws/ws.module';
import { QueuePingModule } from './apps/queue-ping/queue-ping.module';
import { BitrixModule } from './modules/bitrix/bitrix.module';
import { PortalModule } from './modules/portal/portal.module';
import { AlfaActivityModule } from './modules/hooks/alfa/alfa-activity.module';
// import { EventServiceModule } from './apps/event-service/event-service.module';
import { KonstructorModule } from './apps/konstructor/konstructor.module';
import { MetricsModule } from './core/metrics/metrics.module';
import { AlfaModule } from './apps/alfa/alfa.module';
import { TranscriptionModule } from './modules/transcription/transcription.module';
import { GarantPricesModule } from './commands/garant-prices/garant-prices.module';
import { FieldsModule } from './commands/fields/fields.module';
import { CategoryModule } from './commands/category/category.module';
import { ChangeDealCategoryModule } from './commands/change-deal-category/change-deal-category.module';
import { StorageModule } from './core/storage/storage.module';
import { FileLinkModule } from './core/file-link/file-link.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { GarantModule } from './modules/garant/garant.module';
import { PortalKonstructorModule } from './modules/portal-konstructor/portal-konstructor.module';
import { BxDepartmentModule } from '@/modules/bx-department/bx-department.module';
import { PBXInstallModule } from './modules/install/install-module';
import { PbxDomainModule } from './modules/pbx-domain/pbx-domain.module';
import { HelperModule } from './modules/helper/helper.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventServiceAppModule } from './apps/event-service/event-service-app.module';


@Module({
  imports: [

    // DevtoolsModule.register({
    //   http: process.env.NODE_ENV !== 'production'
    // }),

    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: false,
      load: [() => ({
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
      })],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MetricsModule,
    WsModule,
    QueueModule,

    //apps
    EventServiceAppModule,
    // HooksModule,
    AlfaActivityModule,
    BitrixModule,
    PortalModule,
    PBXModule,
    PBXInstallModule,
    PbxDomainModule,
    TelegramModule,
    RedisModule,
    SilentJobHandlersModule,
    KpiReportModule,
    EventSalesModule,


    QueuePingModule,
    KonstructorModule,
    AlfaModule,
    // EventServiceModule

    TranscriptionModule,


    //commands
    // GarantPricesModule,
    // GsrModule,
    // FieldsModule,
    // CategoryModule,
    // ChangeDealCategoryModule,

    StorageModule,
    FileLinkModule,
    GarantModule,
    PortalKonstructorModule,


    BxDepartmentModule,



    HelperModule
  ],
  controllers: [
    AppController,
    HealthController
  ],
  providers: [
    AppService,
    GlobalExceptionFilter,
  ],
})
export class AppModule { }
