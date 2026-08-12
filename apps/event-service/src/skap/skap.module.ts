import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { RedisModule } from '@/core/redis/redis.module';
import { QueueModule } from '@lib/queue';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { PbxSkapSmartModule } from '@lib/portal-lib/pbx/pbx-skap-smart';
import {
    SkapFormatModule,
    SkapNotifyModule,
    SkapStoreModule,
} from '@lib/skap-lib';
import { SkapController } from './skap.controller';
import { SkapExcelParseService } from './services/skap-excel-parse.service';
import { SkapExampleTemplateService } from './services/skap-example-template.service';
import { SkapZipExtractService } from './services/skap-zip-extract.service';
import { SkapContactTaskScheduler } from './cron/skap-contact-task.scheduler';
import { SkapImportScheduler } from './cron/skap-import.scheduler';
import { SkapImportProcessor } from './queue/skap-import.processor';
import { SkapImportRunUseCase } from './use-cases/skap-import-run.use-case';

/**
 * СКАП: ручной парсинг выгрузок (контроллер) + крон-конвейер импорта с
 * Диска Битрикс в смарт «СКАП» (планировщик → Bull-очередь → прогон с
 * тайм-бюджетом). План: ai/tasks/skap-import-pipeline-plan.md.
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        QueueModule,
        PortalAppSettingsModule,
        PbxSkapSmartModule,
        SkapFormatModule,
        SkapStoreModule,
        SkapNotifyModule,
    ],
    controllers: [SkapController],
    providers: [
        // Ручной парсинг (существующие эндпоинты /parse, /parse-file)
        SkapExcelParseService,
        SkapExampleTemplateService,
        SkapZipExtractService,
        // Крон-конвейер импорта
        SkapImportScheduler,
        SkapImportProcessor,
        SkapImportRunUseCase,
        // Еженедельные сводные задачи по автосозданным контактам
        SkapContactTaskScheduler,
    ],
})
export class SkapModule {}
