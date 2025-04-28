import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentModule } from './modules/document/document.module';
import { QueueModule } from './modules/queue/queue.module';
import { HooksModule } from './modules/hooks/hooks.module';
import { ConfigModule } from '@nestjs/config';
import { BitrixModule } from './modules/bitrix/bitrix.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { RedisModule } from './core/redis/redis.module';
import { RedisService } from './core/redis/redis.service';
import { PortalModule } from './modules/portal/portal.module';
import { AlfaActivityModule } from './modules/hooks/alfa/alfa-activity.module';
import { SilentJobHandlersModule } from './core/silence/silent-job-handlers.module';
import { BitrixDepartmentModule } from './modules/bitrix/endpoints/department/department.module';
import { KpiReportModule } from './apps/kpi-report/kpi-report.module';
import { EventSalesModule } from './apps/event-sales/event.module';
import { GsrModule } from './commands/excel-migrate/gsr.module';
import { HealthController } from './health.controller';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: false,
      load: [() => ({
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
      })],
    }),
    AlfaActivityModule,
    DocumentModule,
    QueueModule,
    HooksModule,
    BitrixModule,
    TelegramModule,
    RedisModule,
    PortalModule,
    SilentJobHandlersModule,
    BitrixDepartmentModule,
    KpiReportModule,

    //flow
    EventSalesModule,



    //commands
    GsrModule
  ],
  controllers: [
    AppController,
    HealthController
  
  ],
  providers: [
    AppService,
    GlobalExceptionFilter,
    RedisService
  ],
  exports: [
    BitrixDepartmentModule
  ]
})
export class AppModule { }
