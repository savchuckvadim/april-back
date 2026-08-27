import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { AiModule } from '../../ai/ai.module';
import { TranscriptionStoreModule } from '../../transcription/transcription-store.module';
import { CallReportWeeklyDataService } from './call-report-weekly-data.service';
import { CallReportExcelBuilder } from './call-report-excel.builder';
import { CallReportWeeklyDeliveryService } from './call-report-weekly-delivery.service';
import { SendCallReportWeeklyUseCase } from './send-call-report-weekly.use-case';

/**
 * Недельный Excel-отчёт по звонкам. Только сервисы — без контроллеров:
 * наружу (Swagger приложения) роуты не текут, ручку публикует хост-модуль
 * приложения (правило app-api-surface).
 */
@Module({
    imports: [PBXModule, TranscriptionStoreModule, AiModule, PortalStoreModule],
    providers: [
        CallReportWeeklyDataService,
        CallReportExcelBuilder,
        CallReportWeeklyDeliveryService,
        SendCallReportWeeklyUseCase,
    ],
    exports: [SendCallReportWeeklyUseCase, CallReportExcelBuilder],
})
export class CallReportWeeklyModule {}
