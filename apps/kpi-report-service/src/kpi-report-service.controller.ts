import { Controller, Get } from '@nestjs/common';
import { KpiReportServiceService } from './kpi-report-service.service';

@Controller()
export class KpiReportServiceController {
    constructor(
        private readonly kpiReportServiceService: KpiReportServiceService,
    ) {}

    @Get()
    getHello(): string {
        return this.kpiReportServiceService.getHello();
    }
}
