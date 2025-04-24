import { Module } from '@nestjs/common';

import { KpiReportController } from './kpi-report.controller';
import { ExcelReportService } from './services/kpi-report/kpi-report.service';
import { ReportKpiUseCase } from './usecases/kpi-report.use-case';
import { PortalModule } from 'src/modules/portal/portal.module';
import { BitrixModule } from 'src/modules/bitrix/bitrix.module';
import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
import { PortalContextService } from 'src/modules/portal/services/portal-context.service';
import { BitrixContextService } from 'src/modules/bitrix/services/bitrix-context.service';
import { CallingStatisticUseCase } from './usecases/kpi-calling-statistic.use-case';
@Module({
  imports: [
    PortalModule,
    BitrixModule
  ],
  controllers: [KpiReportController],
  providers: [
    ExcelReportService,
    ReportKpiUseCase,
    CallingStatisticUseCase,
    PortalProviderService,
    // PortalContextService,
    BitrixContextService
  ],
  exports: [ReportKpiUseCase]
})
export class KpiReportModule { }
