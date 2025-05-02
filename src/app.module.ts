import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentModule } from './modules/document/document.module';
import { QueueModule } from './modules/queue/queue.module';

import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './modules/telegram/telegram.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { RedisModule } from './core/redis/redis.module';
import { AlfaActivityModule } from './modules/hooks/alfa/alfa-activity.module';
import { SilentJobHandlersModule } from './core/silence/silent-job-handlers.module';
import { KpiReportModule } from './apps/kpi-report/kpi-report.module';
import { EventSalesModule } from './apps/event-sales/event.module';
import { GsrModule } from './commands/excel-migrate/gsr.module';
import { HealthController } from './health.controller';
import { DevtoolsModule } from '@nestjs/devtools-integration';
import { PBXModule } from './modules/pbx/pbx.module';
import { WsModule } from './core/ws/ws.module';
import { QueuePingModule } from './apps/queue-ping/queue-ping.module';
import { HooksModule } from './modules/hooks/hooks.module';
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

    DocumentModule,
    QueueModule,
    // HooksModule,
    // BitrixModule,
    // PortalModule,
    PBXModule,
    TelegramModule,
    RedisModule,

    SilentJobHandlersModule,

    KpiReportModule,

    //flow
    EventSalesModule,



    //commands
    GsrModule,

    //ws
    WsModule,


    //test queue ws
    QueuePingModule,


    //dependency modules with on init
    AlfaActivityModule,
    HooksModule

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
