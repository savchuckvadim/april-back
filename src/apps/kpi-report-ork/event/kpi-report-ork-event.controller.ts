import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { KpiReportOrkEventService } from "./kpi-report-ork-event.service";

@Controller('kpi-report-ork-event')
export class KpiReportOrkEventController {
    constructor(private readonly service: KpiReportOrkEventService) {}

    @Get()
    async findAll(@Query('domain') domain: string) {
        if (!domain) {
            throw new BadRequestException('Domain is required');
        }
        return this.service.getReport(domain);
    }
}