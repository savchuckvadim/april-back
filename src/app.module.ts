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

import { AlfaActivityModule } from './modules/hooks/alfa/alfa-activity.module';
import { EventServiceAppModule } from './apps/event-service';
import { KonstructorModule } from './apps/konstructor/konstructor.module';
import { MetricsModule } from './core/metrics/metrics.module';
import { AlfaModule } from './apps/alfa/alfa.module';
import { TranscriptionModule } from './modules/transcription/transcription.module';
// import { GarantPricesModule } from './commands/garant-prices/garant-prices.module';
// import { FieldsModule } from './commands/fields/fields.module';
// import { CategoryModule } from './commands/category/category.module';
// import { ChangeDealCategoryModule } from './commands/change-deal-category/change-deal-category.module';
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
// import { EventServiceAppModule } from './apps/event-service/event-service-app.module';
import { OfferTemplateModule } from './modules/offer-template/offer-template.module';
import { KpiReportOrkModule } from './apps/kpi-report-ork/kpi-report-ork.module';
import { BitrixSetupModule } from './modules/bitrix-setup/bitrix-setup.module';
import { BitrixAppClientModule } from './apps/bitrix-app-client/app/bitrix-app-client.module';
import { BitrixModule } from './modules/bitrix/bitrix.module';
import { PortalModule } from './modules/portal/portal.module';
import { AuthModule } from './apps/bitrix-app-client/auth/auth.module';
import { MailModule } from './modules/mail/mail.module';
import { OrkHistoryBxListModule } from './modules/pbx-ork-history-bx-list';
import { CookieModule } from '@/core/cookie/cookie.module';
import { WordTemplateModule } from './modules/offer-template/word';
import { OfferWordModule } from './apps/konstructor/offer-word/offer-word.module';
// import { DealsScheduleModule } from './apps/event-service/deals-schedule/deals-schedule.module';

@Module({
    imports: [
        // DevtoolsModule.register({
        //   http: process.env.NODE_ENV !== 'production'
        // }),

        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
            ignoreEnvFile: false,
            load: [
                () => ({
                    REDIS_URL: process.env.REDIS_URL,
                    REDIS_HOST: process.env.REDIS_HOST,
                    REDIS_PORT: process.env.REDIS_PORT,
                    REDIS_USER: process.env.REDIS_USER,
                    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
                }),
            ],
        }),
        ScheduleModule.forRoot(),
        CookieModule,
        PrismaModule,
        MetricsModule,
        WsModule,
        QueueModule,
        MailModule,
        //apps
        EventServiceAppModule,

        // DealsScheduleModule,

        // HooksModule,
        // AlfaActivityModule,
        BitrixModule,
        PortalModule,
        PBXModule,
        PBXInstallModule,
        PbxDomainModule,
        OrkHistoryBxListModule,

        TelegramModule,
        RedisModule,
        SilentJobHandlersModule,
        KpiReportModule,
        EventSalesModule,

        KpiReportOrkModule,

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
        OfferTemplateModule,
        WordTemplateModule,
        BxDepartmentModule,
        OfferWordModule,


        HelperModule,

        BitrixSetupModule,
        BitrixAppClientModule,

        AuthModule,
    ],
    controllers: [AppController, HealthController],
    providers: [AppService, GlobalExceptionFilter],
})
export class AppModule { }
