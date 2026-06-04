import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueueModule } from './modules/queue/queue.module';

import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { GlobalExceptionFilter } from '@/core/filters/global-exception.filter';
import { RedisModule } from '@/core/redis/redis.module';
// import { SilentJobHandlersModule } from '@/core/silence/silent-job-handlers.module';
import { EventSalesModule } from './apps/event-sales/event.module';
import { HealthController } from './health.controller';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { WsModule } from '@/core/ws/ws.module';
import { QueuePingModule } from './apps/queue-ping/queue-ping.module';
import { EventServiceAppModule } from './apps/event-service';
import { KonstructorModule } from './apps/konstructor/konstructor.module';
import { MetricsModule } from '@/core/metrics/metrics.module';

import { TranscriptionModule } from './modules/transcription/transcription.module';
import { AiModule } from './modules/ai/ai.module';
import { AiRagModule } from '@/modules/ai-rag/ai-rag.module';
import { StorageModule } from '@/core/storage/storage.module';
import { FileLinkModule } from '@/core/file-link/file-link.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { GarantModule } from '@lib/garant/garant.module';
import { PortalKonstructorModule } from '@lib/portal-konstructor/portal-konstructor.module';
import { BxDepartmentModule } from '@/modules/bx-department/bx-department.module';
import { PbxDomainModule } from '@/modules/pbx-domain/pbx-domain.module';
import { HelperModule } from './modules/helper/helper.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OfferTemplateModule } from './modules/offer-template/offer-template.module';
import { KpiReportOrkModule } from './apps/kpi-report-ork/kpi-report-ork.module';
import { BitrixSetupModule } from '@lib/bitrix-setup/bitrix-setup.module';
import { BitrixAppClientModule } from './apps/bitrix-app-client/app/bitrix-app-client.module';
import { BitrixModule } from '@/modules/bitrix/bitrix.module';
import { PortalModule } from '@lib/portal/portal.module';
import { AuthModule } from './apps/bitrix-app-client/auth/auth.module';
import { MailModule } from './modules/mail/mail.module';
import { OrkHistoryBxListModule } from './modules/pbx-ork-history-bx-list';
import { CookieModule } from '@/core/cookie/cookie.module';
import { WordTemplateModule } from './modules/offer-template/word';
import { OfferWordModule } from './apps/konstructor/offer-word/offer-word.module';
import { AdminModule } from './apps/admin/admin.module';
import { OrkDocumentsModule } from './apps/ork-documents/ork-documents.module';
import { EventSalesBxRecordsModule } from './apps/event-sales/bx-records/bx-records.module';
import { DocumentSupplyReportModule } from './apps/konstructor/document-supply-report/document-supply-report.module';
import { InnerDealModule } from './modules/inner-deal/inner-deal.module';
import { InvoiceTemplateModule } from './modules/invoice-template/invoice-template.module';
import { DocumentCounterModule } from './modules/document-counter/document-counter.module';
import { PbxRegistryModule } from './modules/pbx-registry';
import { CommandSmartActGsrModule } from './commands/smart-act-gsr/smart-act-gsr.module';
// import { MissedCallsTodoModule } from './commands/missed-calls-todo/missed-calls-todo.module';
import { DealsScheduleModule } from './apps/event-service/deals-schedule/deals-schedule.module';
import { DealsOrderModule } from './apps/event-service/deals-order/deals-order.module';
import { DealsMoveModule } from './apps/event-service/deals-move/deals-move.module';
import { SkapModule } from './apps/event-service/skap/skap.module';
import { BitrixImBridgeModule } from './commands/bitrix-im-bridge/bitrix-im-bridge.module';
import { CallAnalysisModule } from './modules/call-analysis/call-analysis.module';

const WITH_TELEGRAM = process.env['WITH_TELEGRAM'] === 'true';

@Module({
    imports: [
        // DevtoolsModule.register({
        //   http: process.env.NODE_ENV !== 'production'
        // }),

        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/back/.env', '.env'],
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
        EventEmitterModule.forRoot(),
        CookieModule,
        PrismaModule,
        MetricsModule,
        WsModule,
        QueueModule,
        MailModule,
        //apps
        EventServiceAppModule,

        // HooksModule,
        // AlfaActivityModule,
        BitrixModule,
        PortalModule,
        PBXModule,
        PbxDomainModule,
        OrkHistoryBxListModule,

        TelegramModule,
        RedisModule,
        // SilentJobHandlersModule,
        // KpiReportModule вынесён в отдельное приложение apps/kpi-report-sales
        EventSalesModule,

        KpiReportOrkModule,

        QueuePingModule,
        KonstructorModule,

        // EventServiceModule

        TranscriptionModule,
        AiModule,
        AiRagModule,

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
        DocumentSupplyReportModule,

        HelperModule,

        BitrixSetupModule,
        BitrixAppClientModule,

        AuthModule,
        AdminModule,
        OrkDocumentsModule,

        EventSalesBxRecordsModule,
        InnerDealModule,
        InvoiceTemplateModule,
        DocumentCounterModule,
        PbxRegistryModule,
        CommandSmartActGsrModule,
        DealsScheduleModule, //запускает процессы отдела сервиса по расписанию : DealsOrderModule и DealsMoveModule
        ...(WITH_TELEGRAM ? [BitrixImBridgeModule] : []), //проверяет сообщения лс админа в битриксе только для сервера с телеграмом
        // MissedCallsTodoModule, //gsirk  проверяет пропущенные звонки
        DealsOrderModule, //проверяет дубли и заполненность с по полей каждую неделю
        DealsMoveModule, //перемещает сделки отдела сервиса каждые три часа по стадиям
        SkapModule,
        CallAnalysisModule,
    ],
    controllers: [AppController, HealthController],
    providers: [AppService, GlobalExceptionFilter],
})
export class AppModule {}
