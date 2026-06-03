import { Module } from '@nestjs/common';
import { KpiReportServiceController } from './kpi-report-service.controller';
import { KpiReportServiceService } from './kpi-report-service.service';

@Module({
  imports: [],
  controllers: [KpiReportServiceController],
  providers: [KpiReportServiceService],
})
export class KpiReportServiceModule {}
