import { Module } from '@nestjs/common';

import { KpiReportController } from './kpi-report.controller';
import { ExcelReportService } from './services/kpi-report.service';

@Module({
  controllers: [KpiReportController],
  providers: [ExcelReportService],
})
export class KpiReportModule { }
