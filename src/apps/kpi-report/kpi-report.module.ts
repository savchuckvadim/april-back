import { forwardRef, Module } from '@nestjs/common';

import { KpiReportController } from './kpi-report.controller';
import { ExcelReportService } from './services/kpi-report/kpi-report.service';
import { ReportKpiUseCase } from './usecases/kpi-report.use-case';
import { PortalModule } from 'src/modules/portal/portal.module';
import { BitrixModule } from 'src/modules/bitrix/bitrix.module';
import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
import { CallingStatisticUseCase } from './usecases/kpi-calling-statistic.use-case';
import { BitrixApiFactoryService } from 'src/modules/bitrix/core/queue/bitrix-api.factory.service';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { SalesKpiReportQueueProcessor } from './queue/kpi-report.processor';
@Module({
  imports: [

    PBXModule,
    QueueModule,
 
  ],
  controllers: [KpiReportController],
  providers: [
    ExcelReportService,
    ReportKpiUseCase,
    CallingStatisticUseCase,

    SalesKpiReportQueueProcessor
  ],
  exports: [ReportKpiUseCase]
})
export class KpiReportModule { }
