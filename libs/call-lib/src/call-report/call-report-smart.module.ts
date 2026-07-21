import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
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
    imports: [PBXModule, RedisModule, PortalSmartModule, PbxAicallSmartModule],
    providers: [CallReportSmartResolverService, InstallCallReportSmartUseCase],
    exports: [CallReportSmartResolverService, InstallCallReportSmartUseCase],
})
export class CallReportSmartModule {}
