import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AiModule } from '../ai/ai.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { CallReportBaseItemService } from './services/call-report-base-item.service';
import { CallReportSmartResolverService } from './services/call-report-smart-resolver.service';
import { InstallCallReportSmartUseCase } from './use-cases/install-call-report-smart.use-case';

/**
 * Смарт-процесс «AI-анализ звонков»: const-конфиг, идемпотентная установка,
 * резолвер (Redis-кэш entityTypeId + enum-id), writer элементов.
 *
 * Переиспользуемый модуль (конвенция монорепо): логика в lib, контроллеры —
 * свои в каждом app (event-sales: /call-report/install-smart;
 * admin: /admin/pbx/smarts/install-aicall).
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        PortalSmartModule,
        PbxAicallSmartModule,
        TranscriptionModule,
        AiModule,
    ],
    providers: [
        CallReportSmartResolverService,
        InstallCallReportSmartUseCase,
        CallReportBaseItemService,
    ],
    exports: [
        CallReportSmartResolverService,
        InstallCallReportSmartUseCase,
        CallReportBaseItemService,
    ],
})
export class CallReportSmartModule {}
